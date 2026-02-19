"""
Generates V1 load test charts from real k6 results.
Output: docs/v1-charts.png
"""

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np

# ---------------------------------------------------------------------------
# Data — extracted directly from results.json and stress-results.json
# ---------------------------------------------------------------------------

scenarios = ["Baseline\n200 VUs", "Stress\n500 VUs", "Near-Critical\n700 VUs"]
vus       = [200, 500, 700]

throughput = [1125.2, 2790.0, 6331.4]   # req/s
lat_avg    = [1.73,   2.10,   4.20]     # ms
lat_p90    = [2.84,   3.10,   8.63]     # ms
lat_p95    = [4.08,   4.70,  14.28]     # ms
lat_max    = [189.69, 208.20, 213.30]   # ms

# ---------------------------------------------------------------------------
# Style
# ---------------------------------------------------------------------------

DARK_BG   = "#0d1117"
PANEL_BG  = "#161b22"
BORDER    = "#30363d"
TEXT      = "#e6edf3"
MUTED     = "#8b949e"
BLUE      = "#58a6ff"
GREEN     = "#3fb950"
YELLOW    = "#d29922"
RED       = "#f85149"
ORANGE    = "#e3b341"

plt.rcParams.update({
    "figure.facecolor":  DARK_BG,
    "axes.facecolor":    PANEL_BG,
    "axes.edgecolor":    BORDER,
    "axes.labelcolor":   TEXT,
    "axes.titlecolor":   TEXT,
    "xtick.color":       MUTED,
    "ytick.color":       MUTED,
    "text.color":        TEXT,
    "grid.color":        BORDER,
    "grid.linestyle":    "--",
    "grid.alpha":        0.6,
    "font.family":       "monospace",
    "font.size":         10,
    "axes.spines.top":   False,
    "axes.spines.right": False,
})

fig = plt.figure(figsize=(14, 10), facecolor=DARK_BG)
fig.suptitle(
    "V1 Naive Baseline — Load Test Results",
    fontsize=16, fontweight="bold", color=TEXT, y=0.97
)

x = np.arange(len(scenarios))
bar_w = 0.5

# ---------------------------------------------------------------------------
# Chart 1 — Throughput (bar)
# ---------------------------------------------------------------------------

ax1 = fig.add_subplot(2, 2, 1)
bars = ax1.bar(x, throughput, width=bar_w, color=[GREEN, YELLOW, RED],
               edgecolor=BORDER, linewidth=0.8, zorder=3)

for bar, val in zip(bars, throughput):
    ax1.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 60,
             f"{val:,.0f}", ha="center", va="bottom",
             fontsize=9, fontweight="bold", color=TEXT)

ax1.set_title("Throughput  (req/s)", fontweight="bold", pad=10)
ax1.set_ylabel("req/s", color=MUTED, fontsize=9)
ax1.set_xticks(x)
ax1.set_xticklabels(scenarios, fontsize=9)
ax1.set_ylim(0, max(throughput) * 1.22)
ax1.yaxis.grid(True, zorder=0)
ax1.set_axisbelow(True)

# ---------------------------------------------------------------------------
# Chart 2 — Latency by percentile (grouped bar)
# ---------------------------------------------------------------------------

ax2 = fig.add_subplot(2, 2, 2)
w = 0.22
x2 = np.arange(len(scenarios))

b_avg = ax2.bar(x2 - w,   lat_avg, width=w, label="avg", color=BLUE,   edgecolor=BORDER, linewidth=0.8, zorder=3)
b_p90 = ax2.bar(x2,       lat_p90, width=w, label="p90", color=YELLOW, edgecolor=BORDER, linewidth=0.8, zorder=3)
b_p95 = ax2.bar(x2 + w,   lat_p95, width=w, label="p95", color=RED,    edgecolor=BORDER, linewidth=0.8, zorder=3)

for bars_group in [b_avg, b_p90, b_p95]:
    for bar in bars_group:
        h = bar.get_height()
        ax2.text(bar.get_x() + bar.get_width() / 2, h + 0.2,
                 f"{h:.1f}", ha="center", va="bottom", fontsize=7.5, color=TEXT)

ax2.set_title("Latency by Percentile  (ms)", fontweight="bold", pad=10)
ax2.set_ylabel("ms", color=MUTED, fontsize=9)
ax2.set_xticks(x2)
ax2.set_xticklabels(scenarios, fontsize=9)
ax2.set_ylim(0, max(lat_p95) * 1.35)
ax2.yaxis.grid(True, zorder=0)
ax2.set_axisbelow(True)
ax2.legend(fontsize=8, framealpha=0,
           labelcolor=TEXT, loc="upper left")

# ---------------------------------------------------------------------------
# Chart 3 — p95 latency curve (line — the key "non-linear" story)
# ---------------------------------------------------------------------------

ax3 = fig.add_subplot(2, 2, 3)

ax3.plot(vus, lat_p95, color=RED, linewidth=2.5, marker="o",
         markersize=8, markerfacecolor=RED, markeredgecolor=DARK_BG,
         markeredgewidth=1.5, zorder=4, label="p95 latency")

# Reference line: baseline value extended
ax3.axhline(lat_p95[0], color=GREEN, linewidth=1, linestyle="--",
            alpha=0.6, label=f"baseline ({lat_p95[0]} ms)", zorder=3)

# Annotate each point
for vu, val in zip(vus, lat_p95):
    ax3.annotate(f"{val:.1f} ms",
                 xy=(vu, val),
                 xytext=(8, 8), textcoords="offset points",
                 fontsize=9, color=TEXT, fontweight="bold")

# Shade the degradation zone
ax3.fill_between(vus, lat_p95[0], lat_p95,
                 where=[v > lat_p95[0] for v in lat_p95],
                 color=RED, alpha=0.12, label="degradation")

ax3.set_title("p95 Latency vs Load  (non-linear degradation)", fontweight="bold", pad=10)
ax3.set_xlabel("Virtual Users", color=MUTED, fontsize=9)
ax3.set_ylabel("Latency p95 (ms)", color=MUTED, fontsize=9)
ax3.set_xticks(vus)
ax3.yaxis.grid(True, zorder=0)
ax3.set_axisbelow(True)
ax3.legend(fontsize=8, framealpha=0, labelcolor=TEXT)

# ---------------------------------------------------------------------------
# Chart 4 — Summary table
# ---------------------------------------------------------------------------

ax4 = fig.add_subplot(2, 2, 4)
ax4.axis("off")

col_labels = ["Metric", "Baseline\n200 VUs", "Stress\n500 VUs", "Near-Crit.\n700 VUs"]
rows = [
    ["Throughput (req/s)", "1,125", "2,790", "6,331"],
    ["Latency avg (ms)",   "1.73",  "2.10",  "4.20"],
    ["Latency p90 (ms)",   "2.84",  "3.10",  "8.63"],
    ["Latency p95 (ms)",   "4.08",  "4.70",  "14.28"],
    ["Latency max (ms)",   "189.7", "208.2", "213.3"],
    ["Error rate",         "0.00%", "0.00%", "0.00%"],
    ["Total requests",     "170k",  "508k",  "900k"],
]

table = ax4.table(
    cellText=rows,
    colLabels=col_labels,
    loc="center",
    cellLoc="center",
)
table.auto_set_font_size(False)
table.set_fontsize(9)
table.scale(1, 1.55)

for (row, col), cell in table.get_celld().items():
    cell.set_edgecolor(BORDER)
    cell.set_linewidth(0.8)

    if row == 0:
        cell.set_facecolor("#1f2937")
        cell.set_text_props(color=TEXT, fontweight="bold")
    elif row % 2 == 0:
        cell.set_facecolor("#1a2030")
        cell.set_text_props(color=TEXT)
    else:
        cell.set_facecolor(PANEL_BG)
        cell.set_text_props(color=TEXT)

    # Highlight the 700 VU p95 cell (row=4, col=3) in red
    if row == 4 and col == 3:
        cell.set_facecolor("#3d1a1a")
        cell.set_text_props(color=RED, fontweight="bold")

ax4.set_title("Results Summary", fontweight="bold", pad=10)

# ---------------------------------------------------------------------------
# Footnote
# ---------------------------------------------------------------------------

fig.text(
    0.5, 0.01,
    "Stack: Java 21 + Spring Boot 3.3 · PostgreSQL 16 (single instance) · "
    "No cache · No replicas · Tested with k6",
    ha="center", fontsize=8, color=MUTED
)

# ---------------------------------------------------------------------------
# Save
# ---------------------------------------------------------------------------

plt.tight_layout(rect=[0, 0.03, 1, 0.95])
out = "docs/v1-charts.png"
plt.savefig(out, dpi=150, bbox_inches="tight", facecolor=DARK_BG)
print(f"Saved: {out}")
