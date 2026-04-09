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

Автор: Academic Salon (bibliosaloon.ru)
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
NODE_BORDER_WIDTH = 1.8
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
        return 3.2
    elif r_abs >= 0.4:
        return 2.2
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
LABEL_BG_ALPHA = 0.95
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
    """Estimate ellipse width/height to fit text.

    Returns dimensions in data-coordinate units, calibrated
    for a layout that lives roughly in [-2, 2].
    """
    char_w = 0.044 * (font_size / 11)
    line_h = 0.15 * (font_size / 11)

    lines = text.split("\n")
    max_chars = max(len(l) for l in lines)
    n_lines = len(lines)

    w = max(max_chars * char_w + 0.34, 0.58)
    h = max(n_lines * line_h + 0.18, 0.30)

    # Multiline text needs proportionally taller ellipse
    if n_lines > 1:
        h *= 1.08

    return (w, h)


def _wrap_label(text: str, max_chars: int = 14) -> str:
    """Wrap long labels into multiple lines."""
    if len(text) <= max_chars:
        return text
    words = text.split()
    lines: list[str] = []
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
    iterations: int = 120,
    min_dist: float = 0.65,
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
                    shift = (min_dist - d) / 2 * 1.15
                    pos[v1] = p1 - direction * shift
                    pos[v2] = p2 + direction * shift
                    moved = True
        if not moved:
            break
    return pos


def _clip_line_to_ellipse(
    center: np.ndarray,
    ew: float,
    eh: float,
    target: np.ndarray,
) -> np.ndarray:
    """Find the intersection of a line from center→target with an ellipse.

    Returns the point on the ellipse boundary closest to target direction.
    """
    dx = target[0] - center[0]
    dy = target[1] - center[1]
    dist = math.sqrt(dx * dx + dy * dy)
    if dist < 1e-9:
        return center.copy()

    # Semi-axes (half of width/height)
    a = ew / 2
    b = eh / 2

    # Parametric: intersection of ray from origin at angle theta with ellipse
    # x = a*cos(t), y = b*sin(t)
    # For a ray direction (dx, dy), t = atan2(dy/b, dx/a)
    theta = math.atan2(dy / b, dx / a)

    ix = center[0] + a * math.cos(theta)
    iy = center[1] + b * math.sin(theta)

    return np.array([ix, iy])


def _label_collision(
    new_pos: np.ndarray,
    existing: list[np.ndarray],
    min_dist: float = 0.13,
) -> bool:
    """Check if a label position collides with existing labels."""
    for ex in existing:
        if np.linalg.norm(new_pos - ex) < min_dist:
            return True
    return False


def _find_label_position(
    p1: np.ndarray,
    p2: np.ndarray,
    existing: list[np.ndarray],
    node_centers: list[np.ndarray],
    node_sizes: list[tuple[float, float]],
) -> np.ndarray:
    """Find a non-overlapping position for an edge label.

    Uses a scoring approach: generates many candidates, scores each by
    distance from existing labels and nodes, picks the best valid one.
    """
    mid = (p1 + p2) / 2
    d = p2 - p1
    length = np.linalg.norm(d)
    if length < 1e-9:
        return mid

    # Perpendicular unit vector
    perp = np.array([-d[1], d[0]]) / length

    # Generate a rich set of candidate positions
    offsets_along = [0.5, 0.40, 0.60, 0.35, 0.65, 0.30, 0.70]
    offsets_perp = [0.0, 0.10, -0.10, 0.18, -0.18, 0.26, -0.26]

    candidates = []
    for t in offsets_along:
        base = p1 * (1 - t) + p2 * t
        for op in offsets_perp:
            candidates.append(base + perp * op)

    min_label_dist = 0.17   # minimum distance from other labels
    min_node_margin = 0.08  # extra margin around nodes

    best_cand = None
    best_score = -1e9

    for cand in candidates:
        # Check: not inside any node
        inside_node = False
        node_penalty = 0.0
        for nc, (nw, nh) in zip(node_centers, node_sizes):
            dx_norm = (cand[0] - nc[0]) / (nw / 2 + min_node_margin)
            dy_norm = (cand[1] - nc[1]) / (nh / 2 + min_node_margin)
            ellipse_dist = dx_norm * dx_norm + dy_norm * dy_norm
            if ellipse_dist < 1.0:
                inside_node = True
                break
            # Penalty for being close to a node
            if ellipse_dist < 2.0:
                node_penalty += (2.0 - ellipse_dist)

        if inside_node:
            continue

        # Check: not too close to existing labels
        too_close = False
        label_score = 0.0
        for ex in existing:
            dist = np.linalg.norm(cand - ex)
            if dist < min_label_dist:
                too_close = True
                break
            # Prefer positions farther from existing labels
            label_score += min(dist, 0.5)

        if too_close:
            continue

        # Score: prefer positions close to the edge midpoint (along the edge)
        dist_from_mid = np.linalg.norm(cand - mid)
        # Prefer positions close to the edge line itself
        perp_dist = abs(np.dot(cand - mid, perp))

        score = (
            label_score * 2.0           # reward distance from other labels
            - dist_from_mid * 3.0       # penalty for distance from midpoint
            - perp_dist * 1.5           # penalty for perpendicular offset
            - node_penalty * 2.0        # penalty for proximity to nodes
        )

        if score > best_score:
            best_score = score
            best_cand = cand

    if best_cand is not None:
        return best_cand

    # Fallback: offset from midpoint with perpendicular shift
    return mid + perp * 0.16


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
    sig_corrs: list[tuple[str, str, float, float]] = []
    insig_corrs: list[tuple[str, str, float, float]] = []
    for item in correlations:
        if len(item) == 4:
            var1, var2, r, p = item
        elif len(item) == 3:
            var1, var2, r = item
            p = 0.01
        else:
            raise ValueError(f"Correlation tuple must have 3 or 4 elements, got {len(item)}")
        if abs(r) < min_r_display:
            continue
        if p <= max_p:
            sig_corrs.append((var1, var2, float(r), float(p)))
        elif show_insignificant:
            insig_corrs.append((var1, var2, float(r), float(p)))

    # ---- Build graph for layout ----
    G = nx.Graph()
    G.add_nodes_from(variables)
    for var1, var2, r, p in sig_corrs:
        G.add_edge(var1, var2, weight=abs(r), r=r, p=p)

    # ---- Layout ----
    n = len(variables)
    k = layout_k * (1 + n / 18)

    if n <= 3:
        pos = nx.circular_layout(G, scale=1.4)
    else:
        pos = nx.spring_layout(
            G, k=k, iterations=250, seed=layout_seed, scale=1.6
        )

    # Push apart overlapping nodes — wider spacing for larger graphs
    min_dist = 0.60 + 0.045 * n
    pos = _adjust_positions_no_overlap(pos, variables, min_dist=min_dist)

    # ---- Pre-compute node sizes for clipping and collision ----
    node_labels: dict[str, str] = {}
    node_sizes: dict[str, tuple[float, float]] = {}
    for var in variables:
        label = _wrap_label(var)
        node_labels[var] = label
        node_sizes[var] = _ellipse_size(label, NODE_FONT_SIZE)

    node_centers_list = [pos[v] for v in variables]
    node_sizes_list = [node_sizes[v] for v in variables]

    # ---- Create figure ----
    fig, ax = plt.subplots(figsize=figsize, facecolor="white")
    ax.set_facecolor("white")
    ax.set_aspect("equal")
    ax.axis("off")

    # Compute data bounds with generous padding
    xs = [pos[v][0] for v in variables]
    ys = [pos[v][1] for v in variables]
    x_pad = 0.75
    y_pad = 0.65
    ax.set_xlim(min(xs) - x_pad, max(xs) + x_pad)
    ax.set_ylim(
        min(ys) - y_pad - (0.40 if show_legend else 0),
        max(ys) + y_pad + 0.30,
    )

    # ---- Draw edges ----
    label_positions: list[np.ndarray] = []

    def _draw_edge(var1: str, var2: str, r: float, p: float, is_significant: bool = True):
        p1_center = pos[var1]
        p2_center = pos[var2]

        # Clip edges to ellipse boundaries so lines don't go through nodes
        ew1, eh1 = node_sizes[var1]
        ew2, eh2 = node_sizes[var2]
        p1 = _clip_line_to_ellipse(p1_center, ew1, eh1, p2_center)
        p2 = _clip_line_to_ellipse(p2_center, ew2, eh2, p1_center)

        r_abs = abs(r)
        color = _edge_color(r)

        if not is_significant:
            linestyle = (0, (2, 4))  # dotted
            linewidth = 0.8
            alpha = 0.30
        else:
            if r >= 0:
                linestyle = "-"
            else:
                linestyle = (0, (7, 4))  # long dash for negative
            linewidth = _edge_width(r_abs)
            alpha = 0.88

        # Draw the line
        ax.plot(
            [p1[0], p2[0]], [p1[1], p2[1]],
            color=color,
            linewidth=linewidth,
            linestyle=linestyle,
            alpha=alpha,
            zorder=2,
            solid_capstyle="round",
            dash_capstyle="round",
        )

        # ---- Coefficient label on edge ----
        stars = _significance_stars(p) if is_significant else ""
        label_text = f"{r:.2f}{stars}"

        # Find non-overlapping label position
        label_pos = _find_label_position(
            p1_center, p2_center, label_positions,
            node_centers_list, node_sizes_list,
        )
        label_positions.append(label_pos)

        # Draw label with white background box
        txt = ax.text(
            label_pos[0], label_pos[1], label_text,
            fontsize=LABEL_FONT_SIZE,
            fontfamily=font_family,
            ha="center", va="center",
            zorder=6,
            color=color,
            fontweight="medium",
        )
        txt.set_bbox(dict(
            boxstyle="round,pad=0.18",
            facecolor=LABEL_BG_COLOR,
            edgecolor=LABEL_BORDER_COLOR,
            alpha=LABEL_BG_ALPHA,
            linewidth=0.5,
        ))

    # Draw insignificant edges first (behind)
    for var1, var2, r, p in insig_corrs:
        _draw_edge(var1, var2, r, p, is_significant=False)

    # Draw significant edges (sorted: weaker first so stronger are on top)
    sorted_sig = sorted(sig_corrs, key=lambda x: abs(x[2]))
    for var1, var2, r, p in sorted_sig:
        _draw_edge(var1, var2, r, p, is_significant=True)

    # ---- Draw nodes (ellipses with labels) ----
    for var in variables:
        x, y = pos[var]
        label = node_labels[var]
        ew, eh = node_sizes[var]

        # Draw ellipse with a subtle shadow effect
        shadow = mpatches.Ellipse(
            (x + 0.012, y - 0.012), ew, eh,
            facecolor="#00000008",
            edgecolor="none",
            linewidth=0,
            zorder=9,
        )
        ax.add_patch(shadow)

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
            linespacing=1.2,
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
        pad=22,
        color="#1a1a2e",
    )

    # ---- Legend ----
    if show_legend:
        legend_elements = []

        # Line types (sign)
        legend_elements.append(Line2D(
            [0], [0], color=POS_STRONG_COLOR, linewidth=2.5, linestyle="-",
            label="Положительная корреляция (r > 0)"
        ))
        legend_elements.append(Line2D(
            [0], [0], color=NEG_STRONG_COLOR, linewidth=2.5, linestyle="--",
            label="Отрицательная корреляция (r < 0)"
        ))

        # Thickness (strength)
        legend_elements.append(Line2D(
            [0], [0], color="#555555", linewidth=3.2, linestyle="-",
            label="|r| \u2265 0,60 (сильная связь)"
        ))
        legend_elements.append(Line2D(
            [0], [0], color="#888888", linewidth=2.2, linestyle="-",
            label="0,40 \u2264 |r| < 0,60 (средняя связь)"
        ))
        legend_elements.append(Line2D(
            [0], [0], color="#AAAAAA", linewidth=1.5, linestyle="-",
            label="|r| < 0,40 (слабая связь)"
        ))

        # Significance notation
        legend_elements.append(Line2D(
            [0], [0], color="none", marker="None", linestyle="None",
            label="** \u2014 p < 0,01;   * \u2014 p < 0,05"
        ))

        leg = ax.legend(
            handles=legend_elements,
            loc="lower center",
            bbox_to_anchor=(0.5, -0.03),
            ncol=2,
            fontsize=LEGEND_FONT_SIZE,
            frameon=True,
            fancybox=True,
            shadow=False,
            edgecolor="#CCCCCC",
            facecolor="white",
            framealpha=0.97,
            prop={"family": font_family},
            columnspacing=2.0,
            handlelength=2.5,
            handletextpad=0.8,
            borderpad=1.0,
        )
        leg.set_zorder(20)
        leg.get_frame().set_linewidth(0.8)

    # ---- Save ----
    plt.tight_layout(pad=1.5)

    output_path = Path(output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

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
    seen: set[tuple[str, str]] = set()
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
                p = 0.01

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
