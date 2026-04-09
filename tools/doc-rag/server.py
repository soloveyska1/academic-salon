"""
Local RAG MCP server for document search.

Indexes PDF/DOCX/TXT files into ChromaDB and provides semantic search
with file names, page numbers, and text snippets.
"""

import json
import os
import re
import hashlib
from pathlib import Path

import chromadb
from fastmcp import FastMCP

# ---------------------------------------------------------------------------
# ChromaDB setup – persistent storage
# ---------------------------------------------------------------------------

CHROMA_DIR = os.environ.get(
    "DOC_RAG_DB_DIR", os.path.expanduser("~/.claude/doc-rag-db")
)
COLLECTION_NAME = "documents"

_client = chromadb.PersistentClient(path=CHROMA_DIR)
_collection = _client.get_or_create_collection(
    name=COLLECTION_NAME,
    metadata={"hnsw:space": "cosine"},
)

# ---------------------------------------------------------------------------
# Text extraction helpers
# ---------------------------------------------------------------------------

SUPPORTED_EXTENSIONS = {".pdf", ".docx", ".txt"}
CHUNK_SIZE = 500
CHUNK_OVERLAP = 100


def _extract_pdf(filepath: str) -> list[dict]:
    """Extract text from PDF, returning list of {page, text}."""
    import pymupdf  # noqa: E402 (lazy import; already installed)

    pages = []
    with pymupdf.open(filepath) as doc:
        for i, page in enumerate(doc, start=1):
            text = page.get_text("text")
            if text and text.strip():
                pages.append({"page": i, "text": text})
    return pages


def _extract_docx(filepath: str) -> list[dict]:
    """Extract text from DOCX. Page numbers are approximate (per-paragraph index)."""
    from docx import Document  # noqa: E402

    doc = Document(filepath)
    full_text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    if not full_text.strip():
        return []
    # DOCX has no real page numbers; treat the whole file as page 1
    return [{"page": 1, "text": full_text}]


def _extract_txt(filepath: str) -> list[dict]:
    """Extract text from a plain-text file."""
    with open(filepath, "r", encoding="utf-8", errors="replace") as f:
        text = f.read()
    if not text.strip():
        return []
    return [{"page": 1, "text": text}]


EXTRACTORS = {
    ".pdf": _extract_pdf,
    ".docx": _extract_docx,
    ".txt": _extract_txt,
}


# ---------------------------------------------------------------------------
# Chunking
# ---------------------------------------------------------------------------


def _chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Split text into overlapping chunks at sentence/word boundaries."""
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    if not text:
        return []

    chunks: list[str] = []
    start = 0
    length = len(text)

    while start < length:
        end = start + chunk_size

        # Try to break at sentence boundary
        if end < length:
            # Look for sentence-ending punctuation near the end
            search_region = text[max(start + chunk_size // 2, start) : end + 50]
            for sep in [". ", ".\n", "? ", "!\n", ";\n", "\n\n"]:
                last_sep = search_region.rfind(sep)
                if last_sep != -1:
                    end = max(start + chunk_size // 2, start) + last_sep + len(sep)
                    break

        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)

        start = max(start + 1, end - overlap)

    return chunks


# ---------------------------------------------------------------------------
# ID generation
# ---------------------------------------------------------------------------


def _make_id(filepath: str, page: int, chunk_index: int) -> str:
    """Deterministic chunk ID so re-indexing the same file is idempotent."""
    raw = f"{filepath}::p{page}::c{chunk_index}"
    return hashlib.sha256(raw.encode()).hexdigest()[:24]


# ---------------------------------------------------------------------------
# MCP server
# ---------------------------------------------------------------------------

mcp = FastMCP(
    name="doc-rag",
    instructions=(
        "Local RAG server for document search. "
        "Index PDF/DOCX/TXT files, then search by semantic meaning. "
        "Results include file name, page number, and text snippet."
    ),
)


@mcp.tool()
def index_directory(path: str) -> str:
    """Scan a directory for PDF/DOCX/TXT files and index them into the vector database.

    Args:
        path: Absolute path to the directory to scan (non-recursive by default).
              Subdirectories are included (recursive scan).
    """
    root = Path(path).expanduser().resolve()
    if not root.is_dir():
        return json.dumps({"error": f"Not a directory: {root}"})

    files_indexed = 0
    chunks_created = 0
    errors: list[str] = []

    for filepath in sorted(root.rglob("*")):
        if not filepath.is_file():
            continue
        ext = filepath.suffix.lower()
        if ext not in SUPPORTED_EXTENSIONS:
            continue

        extractor = EXTRACTORS[ext]
        try:
            pages = extractor(str(filepath))
        except Exception as e:
            errors.append(f"{filepath.name}: {e}")
            continue

        if not pages:
            continue

        ids: list[str] = []
        documents: list[str] = []
        metadatas: list[dict] = []

        for page_info in pages:
            page_num = page_info["page"]
            chunks = _chunk_text(page_info["text"])
            for ci, chunk in enumerate(chunks):
                cid = _make_id(str(filepath), page_num, ci)
                ids.append(cid)
                documents.append(chunk)
                metadatas.append(
                    {
                        "file": str(filepath),
                        "filename": filepath.name,
                        "page": page_num,
                        "chunk_index": ci,
                    }
                )

        if ids:
            # Upsert in batches (ChromaDB limit is ~41666 per call)
            batch = 500
            for i in range(0, len(ids), batch):
                _collection.upsert(
                    ids=ids[i : i + batch],
                    documents=documents[i : i + batch],
                    metadatas=metadatas[i : i + batch],
                )
            files_indexed += 1
            chunks_created += len(ids)

    result = {
        "status": "ok",
        "directory": str(root),
        "files_indexed": files_indexed,
        "chunks_created": chunks_created,
        "total_chunks_in_db": _collection.count(),
    }
    if errors:
        result["errors"] = errors

    return json.dumps(result, ensure_ascii=False, indent=2)


@mcp.tool()
def search_documents(query: str, n_results: int = 10) -> str:
    """Semantic search across all indexed documents.

    Args:
        query: Natural-language search query (works with Russian and English).
        n_results: Maximum number of results to return (default 10).
    """
    total = _collection.count()
    if total == 0:
        return json.dumps({"results": [], "message": "Index is empty. Use index_directory first."})

    # Don't request more results than exist
    n = min(n_results, total)

    results = _collection.query(
        query_texts=[query],
        n_results=n,
        include=["documents", "metadatas", "distances"],
    )

    items = []
    for doc, meta, dist in zip(
        results["documents"][0],
        results["metadatas"][0],
        results["distances"][0],
    ):
        items.append(
            {
                "file": meta.get("file", ""),
                "filename": meta.get("filename", ""),
                "page": meta.get("page", 0),
                "chunk_index": meta.get("chunk_index", 0),
                "score": round(1.0 - dist, 4),  # cosine similarity (1 = best)
                "text": doc,
            }
        )

    return json.dumps(items, ensure_ascii=False, indent=2)


@mcp.tool()
def list_indexed() -> str:
    """Show all files currently in the index with chunk counts."""
    total = _collection.count()
    if total == 0:
        return json.dumps({"total_chunks": 0, "files": []})

    # Retrieve all metadata (in batches if large)
    file_counts: dict[str, dict] = {}
    batch_size = 1000
    offset = 0

    while offset < total:
        batch = _collection.get(
            limit=batch_size,
            offset=offset,
            include=["metadatas"],
        )
        for meta in batch["metadatas"]:
            fname = meta.get("file", "unknown")
            if fname not in file_counts:
                file_counts[fname] = {"filename": meta.get("filename", ""), "chunks": 0, "pages": set()}
            file_counts[fname]["chunks"] += 1
            file_counts[fname]["pages"].add(meta.get("page", 0))
        offset += batch_size

    files_list = []
    for fpath, info in sorted(file_counts.items()):
        files_list.append(
            {
                "file": fpath,
                "filename": info["filename"],
                "chunks": info["chunks"],
                "pages": len(info["pages"]),
            }
        )

    return json.dumps(
        {"total_chunks": total, "files": files_list},
        ensure_ascii=False,
        indent=2,
    )


@mcp.tool()
def clear_index() -> str:
    """Clear the entire vector database, removing all indexed documents."""
    global _collection
    _client.delete_collection(COLLECTION_NAME)
    _collection = _client.get_or_create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )
    return json.dumps({"status": "ok", "message": "Index cleared."})


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    mcp.run()
