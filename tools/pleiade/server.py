#!/usr/bin/env python3
"""
FastMCP server for generating correlation pleiades.

Exposes the generate_pleiade function as an MCP tool that can be
called from Claude or any MCP client.

Run:
    python server.py                   # stdio transport (default)
    python server.py --transport sse   # SSE transport on port 8765

Add to MCP config:
    {
        "mcpServers": {
            "pleiade": {
                "command": "python3",
                "args": ["/home/user/academic-salon/tools/pleiade/server.py"]
            }
        }
    }
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Optional

from fastmcp import FastMCP

# Ensure we can import the generator
sys.path.insert(0, str(Path(__file__).parent))
from generate_pleiade import generate_pleiade, generate_pleiade_from_matrix


# ── Create MCP server ──
mcp = FastMCP(
    name="pleiade",
    instructions=(
        "Generates correlation pleiade (constellation) diagrams -- "
        "a standard Russian academic visualization of correlation matrices. "
        "Produces publication-ready PNG/SVG images with professional styling."
    ),
)


@mcp.tool()
def create_pleiade(
    variables: list[str],
    correlations: list[list],
    title: str = "Корреляционная плеяда",
    output: str = "/tmp/pleiade_output.png",
    figure_number: Optional[int] = None,
    dpi: int = 300,
    figsize_width: float = 12.0,
    figsize_height: float = 10.0,
    node_color: str = "#E8F0FE",
    show_legend: bool = True,
    svg_output: bool = False,
    layout_seed: int = 42,
    max_p: float = 0.05,
    min_r_display: float = 0.0,
) -> dict:
    """Generate a correlation pleiade (constellation diagram).

    Creates a publication-ready visualization of correlation relationships
    between variables, following Russian academic conventions.

    Args:
        variables: List of variable names (e.g., ["Мотивация", "Успеваемость"]).
        correlations: List of [var1, var2, r, p] arrays. Each element:
            - var1: first variable name (must be in variables list)
            - var2: second variable name (must be in variables list)
            - r: Pearson correlation coefficient (-1 to 1)
            - p: p-value (significance level)
            Can also be [var1, var2, r] (p defaults to 0.01).
        title: Diagram title text.
        output: Output file path (PNG). Parent dirs created automatically.
        figure_number: If set, title becomes "Рис. N. {title}".
        dpi: Image resolution (300 for print, 150 for screen).
        figsize_width: Figure width in inches.
        figsize_height: Figure height in inches.
        node_color: Node fill color as hex string.
        show_legend: Whether to display the legend.
        svg_output: Also save an SVG version.
        layout_seed: Random seed for reproducible layout.
        max_p: Maximum p-value to display (edges with p > max_p are hidden).
        min_r_display: Minimum |r| to display (filter weak correlations).

    Returns:
        Dict with path, n_variables, n_edges, message.
    """
    corr_tuples = [tuple(c) for c in correlations]

    result_path = generate_pleiade(
        variables=variables,
        correlations=corr_tuples,
        title=title,
        output=output,
        figure_number=figure_number,
        dpi=dpi,
        figsize=(figsize_width, figsize_height),
        node_fill=node_color,
        show_legend=show_legend,
        svg_output=svg_output,
        layout_seed=layout_seed,
        max_p=max_p,
        min_r_display=min_r_display,
    )

    n_edges = sum(
        1 for c in corr_tuples
        if (len(c) >= 4 and c[3] <= max_p and abs(c[2]) >= min_r_display)
        or (len(c) == 3 and abs(c[2]) >= min_r_display)
    )

    response = {
        "path": str(Path(result_path).resolve()),
        "n_variables": len(variables),
        "n_edges": n_edges,
        "message": f"Pleiade saved to {result_path}",
    }

    if svg_output:
        svg_path = Path(result_path).with_suffix(".svg")
        response["svg_path"] = str(svg_path.resolve()) if svg_path.exists() else None

    return response


@mcp.tool()
def create_pleiade_from_json(
    json_data: str,
    output: str = "/tmp/pleiade_output.png",
) -> dict:
    """Generate a pleiade from a JSON string.

    Convenience wrapper that accepts full configuration as a JSON string.

    Args:
        json_data: JSON string with keys:
            - variables (required): list of variable names
            - correlations (required): list of [var1, var2, r, p]
            - title: diagram title
            - figure_number: figure number for "Рис. N" prefix
            - dpi: resolution
            - figsize: [width, height] in inches
            - node_color / node_fill: hex color for nodes
            - show_legend: boolean
            - svg_output: boolean
            - max_p: maximum p-value
            - layout_seed: random seed
        output: Output file path (overrides JSON if provided).

    Returns:
        Dict with path, n_variables, n_edges, message.
    """
    data = json.loads(json_data)

    variables = data["variables"]
    correlations = data["correlations"]

    kwargs = {}
    if "title" in data:
        kwargs["title"] = data["title"]
    if "figure_number" in data:
        kwargs["figure_number"] = data["figure_number"]
    if "dpi" in data:
        kwargs["dpi"] = data["dpi"]
    if "figsize" in data:
        kwargs["figsize"] = tuple(data["figsize"])
    if "node_color" in data or "node_fill" in data:
        kwargs["node_fill"] = data.get("node_color", data.get("node_fill", "#E8F0FE"))
    if "show_legend" in data:
        kwargs["show_legend"] = data["show_legend"]
    if "svg_output" in data:
        kwargs["svg_output"] = data["svg_output"]
    if "max_p" in data:
        kwargs["max_p"] = data["max_p"]
    if "layout_seed" in data:
        kwargs["layout_seed"] = data["layout_seed"]
    if "min_r_display" in data:
        kwargs["min_r_display"] = data["min_r_display"]

    out = data.get("output", output)
    corr_tuples = [tuple(c) for c in correlations]

    result_path = generate_pleiade(
        variables=variables,
        correlations=corr_tuples,
        output=out,
        **kwargs,
    )

    return {
        "path": str(Path(result_path).resolve()),
        "n_variables": len(variables),
        "n_edges": len(corr_tuples),
        "message": f"Pleiade saved to {result_path}",
    }


@mcp.tool()
def create_pleiade_from_matrix(
    variables: list[str],
    matrix: list[list[float]],
    p_matrix: Optional[list[list[float]]] = None,
    title: str = "Корреляционная плеяда",
    output: str = "/tmp/pleiade_matrix.png",
    max_p: float = 0.05,
    figure_number: Optional[int] = None,
    dpi: int = 300,
    svg_output: bool = False,
) -> dict:
    """Generate a pleiade from a correlation matrix.

    Args:
        variables: Variable names (length N).
        matrix: NxN correlation matrix (symmetric, 1s on diagonal).
        p_matrix: NxN p-value matrix (optional; if None, all assumed p=0.01).
        title: Diagram title.
        output: Output file path.
        max_p: Maximum p-value to display.
        figure_number: Figure number for "Рис. N" prefix.
        dpi: Resolution.
        svg_output: Also save SVG.

    Returns:
        Dict with path, n_variables, message.
    """
    n = len(variables)

    matrix_dict: dict[str, dict[str, float]] = {}
    p_dict: Optional[dict[str, dict[str, float]]] = None

    for i, v1 in enumerate(variables):
        matrix_dict[v1] = {}
        for j, v2 in enumerate(variables):
            matrix_dict[v1][v2] = matrix[i][j]

    if p_matrix is not None:
        p_dict = {}
        for i, v1 in enumerate(variables):
            p_dict[v1] = {}
            for j, v2 in enumerate(variables):
                p_dict[v1][v2] = p_matrix[i][j]

    result_path = generate_pleiade_from_matrix(
        matrix=matrix_dict,
        p_matrix=p_dict,
        title=title,
        output=output,
        max_p=max_p,
        figure_number=figure_number,
        dpi=dpi,
        svg_output=svg_output,
    )

    return {
        "path": str(Path(result_path).resolve()),
        "n_variables": n,
        "message": f"Pleiade saved to {result_path}",
    }


# ── Run ──
if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Pleiade MCP Server")
    parser.add_argument(
        "--transport", choices=["stdio", "sse"], default="stdio",
        help="Transport mode (default: stdio)",
    )
    parser.add_argument(
        "--port", type=int, default=8765,
        help="Port for SSE transport (default: 8765)",
    )
    args = parser.parse_args()

    if args.transport == "sse":
        mcp.run(transport="sse", port=args.port)
    else:
        mcp.run()
