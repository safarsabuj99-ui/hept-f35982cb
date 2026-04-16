
Score went 87 → 82 (regressed!). Likely cause: heavy inlined CSS+HTML in `index.html` increased document size and TTFB cost more than it saved. Also — the inlined hero is being rendered, then React replaces it (mismatch causes re-paint, hurting LCP).

Let me inspect what shipped.
