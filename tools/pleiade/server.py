"""
MCP server for generating correlation pleiades.
"""

import json
import tempfile
from pathlib import Path

from fastmcp import FastMCP

mcp = FastMCP(
    "pleiade",
    instructions="Generate publication-ready correlation pleiade diagrams from correlation data.",
)


@mcp.tool()
def generate_pleiade_diagram(
    data_json: str,
    output_dir: str = "/tmp",
    filename: str = "pleiade.png",
) -> str:
    """Generate a correlation pleiade diagram.

    Args:
        data_json: JSON string with format:
            {
              "variables": ["Var1", "Var2", ...],
              "correlations": [["Var1", "Var2", 0.67, 0.01], ...],
              "title": "Корреляционная плеяда",
              "figure_number": 1
            }
            Each correlation: [var1, var2, r_coefficient, p_value]
        output_dir: Directory for output file
        filename: Output filename (supports .png, .svg)

    Returns:
        Path to generated image file
    """
    from generate_pleiade import generate_pleiade

    data = json.loads(data_json)
    output_path = str(Path(output_dir) / filename)

    result = generate_pleiade(
        variables=data["variables"],
        correlations=[tuple(c) for c in data["correlations"]],
        title=data.get("title", "Корреляционная плеяда"),
        output=output_path,
        figure_number=data.get("figure_number"),
        show_legend=data.get("show_legend", True),
        dpi=data.get("dpi", 300),
        svg_output=data.get("svg_output", True),
    )

    return f"Pleiade saved to: {result}"


if __name__ == "__main__":
    mcp.run()
