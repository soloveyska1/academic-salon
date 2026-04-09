#!/usr/bin/env python3
"""
Генератор корреляционных плеяд (Correlation Pleiade / Constellation Diagram).

Профессиональная визуализация корреляционных связей между переменными
в формате, принятом в российской академической практике.

Использование:
    # Как модуль
    from generate_pleiade import generate_pleiade
    generate_pleiade(variables=[...], correlations=[...], output="pleiade.png")

    # Как CLI
    python generate_pleiade.py --input data.json --output pleiade.png
    python generate_pleiade.py --input data.csv --output pleiade.svg --title "Плеяда"
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any, Optional, Sequence

import matplotlib
matplotlib.use("Agg")

import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import matplotlib.patheffects as pe
from matplotlib.lines import Line2D
from matplotlib.patches import FancyBboxPatch
import networkx as nx
import numpy as np


# ---------------------------------------------------------------------------
# Design constants — tuned for publication-ready output
# ---------------------------------------------------------------------------

# Node styling
NODE_FILL = "#E8F0FE"           # very light blue
NODE_FILL_ALT = "#FFF8E7"       # light cream (alternative)
NODE_BORDER = "#333333"
NODE_BORDER_WIDTH = 1.5
NODE_FONT_SIZE = 11
NODE_FONT_WEIGHT = "bold"
NODE_FONT_FAMILY = "DejaVu Sans"

# Edge styling — positive correlations (warm)
POS_STRONG_COLOR = "#C0392B"    # dark red, |r| >= 0.6
POS_MODERATE_COLOR = "#E67E22"  # orange,   |r| >= 0.4
POS_WEAK_COLOR = "#E8A87C"      # soft peach, |r| < 0.4

# Edge styling — negative correlations (cool)
NEG_STRONG_COLOR = "#2980B9"    # dark blue,  |r| >= 0.6
NEG_MODERATE_COLOR = "#5DADE2"  # medium blue, |r| >= 0.4
NEG_WEAK_COLOR = "#85C1E9"      # light blue,  |r| < 0.4

# Edge thickness by |r|
def _edge_width(r_abs: float) -> float:
    if r_abs >= 0.6:
        return 3.0
    elif r_abs >= 0.4:
        return 2.0
    else:
        return 1.5

# Edge color by sign and magnitude
def _edge_color(r: float) -> str:
    r_abs = abs(r)
    if r >= 0:
        if r_abs >= 0.6:
            return POS_STRONG_COLOR
        elif r_abs >= 0.4:
            return POS_MODERATE_COLOR
        else:
            return POS_WEAK_COLOR
    else:
        if r_abs >= 0.6:
            return NEG_STRONG_COLOR
        elif r_abs >= 0.4:
            return NEG_MODERATE_COLOR
        else:
            return NEG_WEAK_COLOR

# Label font
LABEL_FONT_SIZE = 9
LABEL_BG_COLOR = "white"
LABEL_BG_ALPHA = 0.92
LABEL_BORDER_COLOR = "#CCCCCC"

# Title
TITLE_FONT_SIZE = 14
TITLE_FONT_WEIGHT = "bold"

# Legend
LEGEND_FONT_SIZE = 9

# Layout
DEFAULT_FIGSIZE = (12, 10)
DEFAULT_DPI = 300
DEFAULT_K_SPRING = 2.5          # spring layout spacing
DEFAULT_SEED = 42


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _significance_stars(p: float) -> str:
    """Return significance stars based on p-value."""
    if p <= 0.001:
        return "***"
    elif p <= 0.01:
        return "**"
    elif p <= 0.05:
        return "*"
    return ""


def _ellipse_size(text: str, font_size: float = NODE_FONT_SIZE) -> tuple[float, float]:
    """Estimate ellipse width/height to fit text."""
    # Approximate character width at given font size (in data coords).
    # These are tuned for the coordinate space we use (~[-2, 2]).
    char_w = 0.035 * (font_size / 11)
    line_h = 0.12 * (font_size / 11)

    # Handle multi-line text
    lines = text.split("\n")
    max_chars = max(len(l) for l in lines)
    n_lines = len(lines)

    w = max(max_chars * char_w + 0.22, 0.48)   # min width
    h = max(n_lines * line_h + 0.12, 0.22)     # min height

    return (w, h)


def _wrap_label(text: str, max_chars: int = 14) -> str:
    """Wrap long labels into multiple lines."""
    if len(text) <= max_chars:
        return text
    words = text.split()
    lines = []
    current = ""
    for w in words:
        if current and len(current) + 1 + len(w) > max_chars:
            lines.append(current)
            current = w
        else:
            current = f"{current} {w}".strip()
    if current:
        lines.append(current)
    return "\n".join(lines)


def _adjust_positions_no_overlap(
    pos: dict[str, np.ndarray],
    variables: list[str],
    iterations: int = 80,
    min_dist: float = 0.55,
) -> dict[str, np.ndarray]:
    """Push apart overlapping nodes using simple repulsion."""
    pos = {k: v.copy() for k, v in pos.items()}
    for _ in range(iterations):
        moved = False
        for i, v1 in enumerate(variables):
            for v2 in variables[i + 1:]:
                p1, p2 = pos[v1], pos[v2]
                d = np.linalg.norm(p2 - p1)
                if d < min_dist and d > 1e-6:
                    direction = (p2 - p1) / d
                    shift = (min_dist - d) / 2 * 1.1
                    pos[v1] = p1 - direction * shift
                    pos[v2] = p2 + direction * shift
                    moved = True
        if not moved:
            break
    return pos


def _edge_midpoint_offset(
    p1: np.ndarray,
    p2: np.ndarray,
    offset_frac: float = 0.0,
) -> np.ndarray:
    """Compute the midpoint of an edge, optionally offset perpendicular."""
    mid = (p1 + p2) / 2
    if abs(offset_frac) < 1e-6:
        return mid
    d = p2 - p1
    perp = np.array([-d[1], d[0]])
    norm = np.linalg.norm(perp)
    if norm > 1e-6:
        perp = perp / norm
    return mid + perp * offset_frac


# ---------------------------------------------------------------------------
# Main generation function
# ---------------------------------------------------------------------------

def generate_pleiade(
    variables: list[str],
    correlations: list[tuple[str, str, float, float]],
    title: str = "Корреляционная плеяда",
    output: str = "pleiade.png",
    *,
    significance_levels: Optional[dict[float, str]] = None,
    show_legend: bool = True,
    dpi: int = DEFAULT_DPI,
    figsize: tuple[float, float] = DEFAULT_FIGSIZE,
    node_fill: str = NODE_FILL,
    min_r_display: float = 0.0,
    layout_seed: int = DEFAULT_SEED,
    layout_k: float = DEFAULT_K_SPRING,
    figure_number: Optional[int] = None,
    font_family: str = NODE_FONT_FAMILY,
    svg_output: bool = False,
    show_insignificant: bool = False,
    max_p: float = 0.05,
) -> str:
    """
    Generate a correlation pleiade (constellation diagram).

    Parameters
    ----------
    variables : list[str]
        Variable names to display as nodes.
    correlations : list of (var1, var2, r, p)
        Each tuple: variable1 name, variable2 name, correlation coefficient,
        p-value. Only significant correlations (p <= max_p) are shown.
    title : str
        Diagram title.
    output : str
        Output file path (.png or .svg).
    significance_levels : dict, optional
        Mapping of p-value thresholds to display styles. Default:
        {0.01: "thick", 0.05: "normal"}.
    show_legend : bool
        Whether to show the legend.
    dpi : int
        Output resolution.
    figsize : tuple
        Figure size in inches (width, height).
    node_fill : str
        Node fill color hex.
    min_r_display : float
        Minimum |r| to display (filter weak correlations).
    layout_seed : int
        Random seed for layout reproducibility.
    layout_k : float
        Spring layout spacing parameter. Larger = more spread out.
    figure_number : int, optional
        If given, title becomes "Рис. {N}. {title}".
    font_family : str
        Font family for all text.
    svg_output : bool
        Also save SVG version alongside PNG.
    show_insignificant : bool
        If True, show non-significant correlations as very thin dotted lines.
    max_p : float
        Maximum p-value to consider significant.

    Returns
    -------
    str
        Path to the generated output file.
    """
    if significance_levels is None:
        significance_levels = {0.001: "very_thick", 0.01: "thick", 0.05: "normal"}

    # ---- Filter correlations ----
    sig_corrs = []
    insig_corrs = []
    for var1, var2, r, p in correlations:
        if abs(r) < min_r_display:
            continue
        if p <= max_p:
            sig_corrs.append((var1, var2, r, p))
        elif show_insignificant:
            insig_corrs.append((var1, var2, r, p))

    # ---- Build graph for layout ----
    G = nx.Graph()
    G.add_nodes_from(variables)
    for var1, var2, r, p in sig_corrs:
        G.add_edge(var1, var2, weight=abs(r), r=r, p=p)

    # ---- Layout ----
    n = len(variables)
    k = layout_k * (1 + n / 20)  # scale spacing with node count

    if n <= 3:
        # For very few nodes, use circular layout
        pos = nx.circular_layout(G, scale=1.2)
    else:
        pos = nx.spring_layout(
            G, k=k, iterations=200, seed=layout_seed, scale=1.5
        )

    # Push apart overlapping nodes
    min_dist = 0.50 + 0.03 * n
    pos = _adjust_positions_no_overlap(pos, variables, min_dist=min_dist)

    # ---- Create figure ----
    fig, ax = plt.subplots(figsize=figsize, facecolor="white")
    ax.set_facecolor("white")
    ax.set_aspect("equal")
    ax.axis("off")

    # Compute data bounds for padding
    xs = [pos[v][0] for v in variables]
    ys = [pos[v][1] for v in variables]
    x_margin = 0.6
    y_margin = 0.5
    ax.set_xlim(min(xs) - x_margin, max(xs) + x_margin)
    ax.set_ylim(min(ys) - y_margin - (0.35 if show_legend else 0),
                max(ys) + y_margin + 0.25)

    # ---- Draw edges ----
    # Track label positions to avoid overlap
    label_positions: list[np.ndarray] = []

    def _draw_edge(var1, var2, r, p, is_significant=True):
        p1 = pos[var1]
        p2 = pos[var2]

        r_abs = abs(r)
        color = _edge_color(r)

        if not is_significant:
            linestyle = ":"
            linewidth = 0.8
            alpha = 0.35
        else:
            linestyle = "-" if r >= 0 else "--"
            linewidth = _edge_width(r_abs)
            alpha = 0.85

        # Draw the line
        ax.plot(
            [p1[0], p2[0]], [p1[1], p2[1]],
            color=color,
            linewidth=linewidth,
            linestyle=linestyle,
            alpha=alpha,
            zorder=1,
            solid_capstyle="round",
        )

        # ---- Label with coefficient ----
        stars = _significance_stars(p) if is_significant else ""
        label_text = f"{r:.2f}{stars}"

        # Find a non-overlapping position for the label
        mid = _edge_midpoint_offset(p1, p2)

        # Check for overlap with existing labels and shift if needed
        for existing in label_positions:
            if np.linalg.norm(mid - existing) < 0.15:
                mid = _edge_midpoint_offset(p1, p2, offset_frac=0.08)
                break

        label_positions.append(mid)

        # Draw label with white background
        txt = ax.text(
            mid[0], mid[1], label_text,
            fontsize=LABEL_FONT_SIZE,
            fontfamily=font_family,
            ha="center", va="center",
            zorder=5,
            color=color,
            fontweight="medium",
        )
        txt.set_bbox(dict(
            boxstyle="round,pad=0.15",
            facecolor=LABEL_BG_COLOR,
            edgecolor=LABEL_BORDER_COLOR,
            alpha=LABEL_BG_ALPHA,
            linewidth=0.5,
        ))

    # Draw insignificant edges first (behind)
    for var1, var2, r, p in insig_corrs:
        _draw_edge(var1, var2, r, p, is_significant=False)

    # Draw significant edges
    for var1, var2, r, p in sig_corrs:
        _draw_edge(var1, var2, r, p, is_significant=True)

    # ---- Draw nodes (ellipses with labels) ----
    for var in variables:
        x, y = pos[var]
        label = _wrap_label(var)
        ew, eh = _ellipse_size(label, NODE_FONT_SIZE)

        # Draw ellipse using FancyBboxPatch for smooth rounded look
        ellipse = mpatches.Ellipse(
            (x, y), ew, eh,
            facecolor=node_fill,
            edgecolor=NODE_BORDER,
            linewidth=NODE_BORDER_WIDTH,
            zorder=10,
        )
        ax.add_patch(ellipse)

        # Draw variable name
        ax.text(
            x, y, label,
            fontsize=NODE_FONT_SIZE,
            fontfamily=font_family,
            fontweight=NODE_FONT_WEIGHT,
            ha="center", va="center",
            zorder=11,
            color="#1a1a2e",
        )

    # ---- Title ----
    title_text = title
    if figure_number is not None:
        title_text = f"Рис. {figure_number}. {title}"

    ax.set_title(
        title_text,
        fontsize=TITLE_FONT_SIZE,
        fontfamily=font_family,
        fontweight=TITLE_FONT_WEIGHT,
        pad=20,
        color="#1a1a2e",
    )

    # ---- Legend ----
    if show_legend:
        legend_elements = []

        # Line types
        legend_elements.append(Line2D(
            [0], [0], color=POS_STRONG_COLOR, linewidth=2.5, linestyle="-",
            label="Положительная корреляция (r > 0)"
        ))
        legend_elements.append(Line2D(
            [0], [0], color=NEG_STRONG_COLOR, linewidth=2.5, linestyle="--",
            label="Отрицательная корреляция (r < 0)"
        ))

        # Thickness
        legend_elements.append(Line2D(
            [0], [0], color="#666666", linewidth=3.0, linestyle="-",
            label="|r| \u2265 0.60 (сильная связь)"
        ))
        legend_elements.append(Line2D(
            [0], [0], color="#999999", linewidth=2.0, linestyle="-",
            label="0.40 \u2264 |r| < 0.60 (средняя связь)"
        ))
        legend_elements.append(Line2D(
            [0], [0], color="#BBBBBB", linewidth=1.5, linestyle="-",
            label="|r| < 0.40 (слабая связь)"
        ))

        # Significance
        legend_elements.append(Line2D(
            [0], [0], color="none", marker="None", linestyle="None",
            label="** — p < 0.01;   * — p < 0.05"
        ))

        leg = ax.legend(
            handles=legend_elements,
            loc="lower center",
            bbox_to_anchor=(0.5, -0.02),
            ncol=2,
            fontsize=LEGEND_FONT_SIZE,
            frameon=True,
            fancybox=True,
            shadow=False,
            edgecolor="#CCCCCC",
            facecolor="white",
            framealpha=0.95,
            prop={"family": font_family},
            columnspacing=1.5,
            handlelength=2.5,
        )
        leg.set_zorder(20)

    # ---- Save ----
    plt.tight_layout(pad=1.5)

    output_path = Path(output)
    fig.savefig(
        str(output_path),
        dpi=dpi,
        bbox_inches="tight",
        facecolor="white",
        edgecolor="none",
        pad_inches=0.3,
    )

    # Optionally save SVG
    svg_path = None
    if svg_output or output_path.suffix.lower() == ".svg":
        svg_path = output_path.with_suffix(".svg")
        fig.savefig(
            str(svg_path),
            format="svg",
            bbox_inches="tight",
            facecolor="white",
            edgecolor="none",
            pad_inches=0.3,
        )

    plt.close(fig)

    result_path = str(output_path)
    print(f"Pleiade saved to: {result_path}")
    if svg_path and svg_path != output_path:
        print(f"SVG version saved to: {svg_path}")

    return result_path


# ---------------------------------------------------------------------------
# Convenience: build from a correlation matrix (pandas DataFrame or dict)
# ---------------------------------------------------------------------------

def generate_pleiade_from_matrix(
    matrix: Any,
    p_matrix: Any = None,
    title: str = "Корреляционная плеяда",
    output: str = "pleiade.png",
    max_p: float = 0.05,
    **kwargs,
) -> str:
    """
    Generate pleiade from a correlation matrix.

    Parameters
    ----------
    matrix : pandas DataFrame or dict of dict
        Correlation matrix (symmetric). E.g., df.corr().
    p_matrix : pandas DataFrame or dict of dict, optional
        P-value matrix (same shape). If None, all correlations assumed p=0.01.
    title, output, **kwargs : passed to generate_pleiade().

    Returns
    -------
    str : path to generated file.
    """
    try:
        import pandas as pd
        if isinstance(matrix, pd.DataFrame):
            variables = list(matrix.columns)
            matrix_dict = matrix.to_dict()
        else:
            variables = list(matrix.keys())
            matrix_dict = matrix
    except ImportError:
        variables = list(matrix.keys())
        matrix_dict = matrix

    correlations = []
    seen = set()
    for v1 in variables:
        for v2 in variables:
            if v1 == v2:
                continue
            pair = tuple(sorted([v1, v2]))
            if pair in seen:
                continue
            seen.add(pair)

            r = matrix_dict[v1][v2] if isinstance(matrix_dict[v1], dict) else matrix_dict[v1].get(v2, 0)

            if p_matrix is not None:
                try:
                    p = p_matrix[v1][v2] if isinstance(p_matrix, dict) else p_matrix.loc[v1, v2]
                except (KeyError, AttributeError):
                    p = 0.01
            else:
                p = 0.01  # assume significant if no p-values

            correlations.append((v1, v2, float(r), float(p)))

    return generate_pleiade(
        variables=variables,
        correlations=correlations,
        title=title,
        output=output,
        max_p=max_p,
        **kwargs,
    )


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _parse_csv_input(path: str) -> tuple[list[str], list[tuple]]:
    """Parse a simple CSV with columns: var1, var2, r, p."""
    import csv
    correlations = []
    variables_set: set[str] = set()
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            var1 = row.get("var1", row.get("variable1", "")).strip()
            var2 = row.get("var2", row.get("variable2", "")).strip()
            r = float(row.get("r", row.get("correlation", 0)))
            p = float(row.get("p", row.get("p_value", row.get("pvalue", 0.05))))
            variables_set.add(var1)
            variables_set.add(var2)
            correlations.append((var1, var2, r, p))
    return sorted(variables_set), correlations


def _parse_json_input(path: str) -> dict:
    """Parse JSON input file."""
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data


def main():
    parser = argparse.ArgumentParser(
        description="Генератор корреляционных плеяд",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Примеры:
  python generate_pleiade.py --input data.json --output pleiade.png
  python generate_pleiade.py --input data.csv --output pleiade.svg --title "Плеяда"
  python generate_pleiade.py --input data.json --dpi 600 --figsize 14 12

Формат JSON:
{
  "variables": ["A", "B", "C"],
  "correlations": [
    ["A", "B", 0.65, 0.01],
    ["B", "C", -0.42, 0.05]
  ],
  "title": "Корреляционная плеяда"
}

Формат CSV (с заголовками):
var1,var2,r,p
A,B,0.65,0.01
B,C,-0.42,0.05
        """,
    )
    parser.add_argument("--input", "-i", required=True, help="Input file (JSON or CSV)")
    parser.add_argument("--output", "-o", default="pleiade.png", help="Output file (PNG or SVG)")
    parser.add_argument("--title", "-t", default=None, help="Diagram title")
    parser.add_argument("--dpi", type=int, default=DEFAULT_DPI, help="Resolution (default: 300)")
    parser.add_argument("--figsize", nargs=2, type=float, default=None, help="Figure size: WIDTH HEIGHT")
    parser.add_argument("--no-legend", action="store_true", help="Hide legend")
    parser.add_argument("--figure-number", "-n", type=int, default=None, help="Figure number (Рис. N)")
    parser.add_argument("--svg", action="store_true", help="Also save SVG version")
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED, help="Layout random seed")
    parser.add_argument("--max-p", type=float, default=0.05, help="Max p-value to show (default 0.05)")
    parser.add_argument("--node-color", default=NODE_FILL, help="Node fill color (hex)")

    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Error: Input file not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    # Parse input
    if input_path.suffix.lower() == ".csv":
        variables, correlations = _parse_csv_input(str(input_path))
        title = args.title or "Корреляционная плеяда"
    elif input_path.suffix.lower() == ".json":
        data = _parse_json_input(str(input_path))
        variables = data["variables"]
        correlations = [tuple(c) for c in data["correlations"]]
        title = args.title or data.get("title", "Корреляционная плеяда")
    else:
        print(f"Error: Unsupported input format: {input_path.suffix}", file=sys.stderr)
        sys.exit(1)

    figsize = tuple(args.figsize) if args.figsize else DEFAULT_FIGSIZE

    generate_pleiade(
        variables=variables,
        correlations=correlations,
        title=title,
        output=args.output,
        show_legend=not args.no_legend,
        dpi=args.dpi,
        figsize=figsize,
        figure_number=args.figure_number,
        svg_output=args.svg,
        layout_seed=args.seed,
        max_p=args.max_p,
        node_fill=args.node_color,
    )


if __name__ == "__main__":
    main()
