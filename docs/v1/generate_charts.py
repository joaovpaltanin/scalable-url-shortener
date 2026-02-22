"""
Generates V1 load test charts from real k6 results.
Output: docs/v1-charts.png
"""

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

# ---------------------------------------------------------------------------
# Data — all 4 test scenarios from v1.md
# ---------------------------------------------------------------------------

scenarios = ["Baseline\n200 VUs", "Stress\n700 VUs", "Breakpoint\n2000 VUs"]
vus       = [200, 700, 2000]

throughput = [1125.0, 6331.0, 9131.0]
lat_avg    = [1.73,   4.20,   62.4]
lat_p90    = [2.84,   8.63,   133.0]
lat_p95    = [4.08,   14.3,   159.2]

chaos_total    = 3018
chaos_success  = 2000
chaos_failures = 518

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

# ---------------------------------------------------------------------------
# Chart 1 — Throughput (bar)
# ---------------------------------------------------------------------------

ax1 = fig.add_subplot(2, 2, 1)
colors_tp = [GREEN, YELLOW, RED]
bars = ax1.bar(x, throughput, width=0.5, color=colors_tp,
               edgecolor=BORDER, linewidth=0.8, zorder=3)

for bar, val in zip(bars, throughput):
    ax1.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 120,
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
# Chart 2 — p95 Latency curve (the key story: non-linear degradation)
# ---------------------------------------------------------------------------

ax2 = fig.add_subplot(2, 2, 2)

ax2.plot(vus, lat_p95, color=RED, linewidth=2.5, marker="o",
         markersize=8, markerfacecolor=RED, markeredgecolor=DARK_BG,
         markeredgewidth=1.5, zorder=4, label="p95 latency")

ax2.axhline(lat_p95[0], color=GREEN, linewidth=1, linestyle="--",
            alpha=0.6, label=f"baseline ({lat_p95[0]} ms)", zorder=3)

for vu, val in zip(vus, lat_p95):
    offset_y = 10 if val < 100 else -18
    ax2.annotate(f"{val:.1f} ms",
                 xy=(vu, val),
                 xytext=(8, offset_y), textcoords="offset points",
                 fontsize=9, color=TEXT, fontweight="bold")

ax2.fill_between(vus, lat_p95[0], lat_p95,
                 where=[v > lat_p95[0] for v in lat_p95],
                 color=RED, alpha=0.12, label="degradation zone")

ax2.set_title("p95 Latency vs Load  (39x degradation)", fontweight="bold", pad=10)
ax2.set_xlabel("Virtual Users", color=MUTED, fontsize=9)
ax2.set_ylabel("Latency p95 (ms)", color=MUTED, fontsize=9)
ax2.set_xticks(vus)
ax2.yaxis.grid(True, zorder=0)
ax2.set_axisbelow(True)
ax2.legend(fontsize=8, framealpha=0, labelcolor=TEXT)

# ---------------------------------------------------------------------------
# Chart 3 — Latency by percentile (grouped bar, all 3 load scenarios)
# ---------------------------------------------------------------------------

ax3 = fig.add_subplot(2, 2, 3)
w = 0.22
x3 = np.arange(len(scenarios))

b_avg = ax3.bar(x3 - w, lat_avg, width=w, label="avg", color=BLUE,
                edgecolor=BORDER, linewidth=0.8, zorder=3)
b_p90 = ax3.bar(x3,     lat_p90, width=w, label="p90", color=YELLOW,
                edgecolor=BORDER, linewidth=0.8, zorder=3)
b_p95 = ax3.bar(x3 + w, lat_p95, width=w, label="p95", color=RED,
                edgecolor=BORDER, linewidth=0.8, zorder=3)

for bars_group in [b_avg, b_p90, b_p95]:
    for bar in bars_group:
        h = bar.get_height()
        ax3.text(bar.get_x() + bar.get_width() / 2, h + 1.5,
                 f"{h:.1f}", ha="center", va="bottom", fontsize=7, color=TEXT)

ax3.set_title("Latency by Percentile  (ms)", fontweight="bold", pad=10)
ax3.set_ylabel("ms", color=MUTED, fontsize=9)
ax3.set_xticks(x3)
ax3.set_xticklabels(scenarios, fontsize=9)
ax3.set_ylim(0, max(lat_p95) * 1.25)
ax3.yaxis.grid(True, zorder=0)
ax3.set_axisbelow(True)
ax3.legend(fontsize=8, framealpha=0, labelcolor=TEXT, loc="upper left")

# ---------------------------------------------------------------------------
# Chart 4 — Chaos test: success vs failure (stacked bar + annotation)
# ---------------------------------------------------------------------------

ax4 = fig.add_subplot(2, 2, 4)

bar_s = ax4.bar(["Chaos Test\n100 VUs, 60s"], [chaos_success],
                color=GREEN, edgecolor=BORDER, linewidth=0.8,
                label=f"Success ({chaos_success})", zorder=3, width=0.4)
bar_f = ax4.bar(["Chaos Test\n100 VUs, 60s"], [chaos_failures],
                bottom=[chaos_success],
                color=RED, edgecolor=BORDER, linewidth=0.8,
                label=f"Failures ({chaos_failures})", zorder=3, width=0.4)

ax4.text(0, chaos_success / 2, f"{chaos_success}\nsuccess",
         ha="center", va="center", fontsize=10, fontweight="bold", color=DARK_BG)
ax4.text(0, chaos_success + chaos_failures / 2, f"{chaos_failures}\nfailed",
         ha="center", va="center", fontsize=10, fontweight="bold", color=TEXT)

pct = chaos_failures / chaos_total * 100
ax4.text(0, chaos_total + 80,
         f"17.2% error rate\n100% during downtime",
         ha="center", va="bottom", fontsize=9, color=RED, fontweight="bold")

ax4.set_title("Chaos Test — Kill App Mid-Traffic", fontweight="bold", pad=10)
ax4.set_ylabel("Requests", color=MUTED, fontsize=9)
ax4.set_ylim(0, chaos_total * 1.25)
ax4.yaxis.grid(True, zorder=0)
ax4.set_axisbelow(True)
ax4.legend(fontsize=8, framealpha=0, labelcolor=TEXT, loc="upper right")

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
