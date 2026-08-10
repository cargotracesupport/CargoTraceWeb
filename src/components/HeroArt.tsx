// Original decorative illustration: a glassy "live tracking" scene with a route,
// a truck on the road, origin/destination pins and floating chips. Pure SVG,
// brand-gradient colored. Used on the login hero and customer page.
export default function HeroArt({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 480 380"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="ha-route" x1="0" y1="380" x2="480" y2="0">
          <stop offset="0" stopColor="#2563eb" />
          <stop offset="1" stopColor="#06b6d4" />
        </linearGradient>
        <linearGradient id="ha-badge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#06b6d4" />
        </linearGradient>
        <linearGradient id="ha-card" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="1" stopColor="#eaf1ff" stopOpacity="0.7" />
        </linearGradient>
      </defs>

      {/* map panel */}
      <rect
        x="24"
        y="44"
        width="432"
        height="300"
        rx="28"
        fill="url(#ha-card)"
        stroke="#cdddf7"
      />
      {/* faint grid */}
      <g stroke="#dbe7fa" strokeWidth="1.2">
        <path d="M24 134H456M24 224H456M124 44V344M244 44V344M356 44V344" />
      </g>

      {/* route */}
      <path
        d="M92 286 C 150 250, 150 190, 220 178 S 320 150, 392 96"
        stroke="url(#ha-route)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray="2 14"
      />
      <path
        d="M92 286 C 150 250, 150 190, 220 178 S 320 150, 392 96"
        stroke="url(#ha-route)"
        strokeWidth="5"
        strokeLinecap="round"
        opacity="0.18"
      />

      {/* origin (warehouse) */}
      <g transform="translate(74,268)">
        <ellipse cx="18" cy="34" rx="16" ry="3.4" fill="#0f172a" opacity="0.12" />
        <path d="M2 14 18 4 34 14Z" fill="#2a86b8" />
        <rect x="5" y="14" width="26" height="18" rx="2" fill="#40c4ff" />
        <rect x="13" y="20" width="10" height="12" rx="1" fill="#0e3a57" />
      </g>

      {/* destination (pin) */}
      <g transform="translate(376,72)">
        <ellipse cx="14" cy="34" rx="9" ry="3" fill="#0f172a" opacity="0.12" />
        <path
          d="M14 1C7 1 2 6.4 2 12.6 2 21 14 33 14 33S26 21 26 12.6C26 6.4 21 1 14 1Z"
          fill="#f97316"
        />
        <circle cx="14" cy="12" r="4.4" fill="#fff" />
      </g>

      {/* truck on the route */}
      <g transform="translate(196,150)">
        <circle cx="22" cy="22" r="24" fill="url(#ha-badge)" opacity="0.18" />
        <circle cx="22" cy="22" r="17" fill="url(#ha-badge)" />
        <g
          transform="translate(11.5,12.5)"
          stroke="#fff"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        >
          <rect x="0.5" y="3" width="11" height="9" rx="1.5" />
          <path d="M11.5 6h4l3.5 3.5V12h-7.5z" />
          <circle cx="5" cy="14.5" r="1.7" />
          <circle cx="15.5" cy="14.5" r="1.7" />
        </g>
      </g>

      {/* floating ETA chip */}
      <g transform="translate(300,196)">
        <rect
          x="0"
          y="0"
          width="132"
          height="56"
          rx="16"
          fill="#fff"
          stroke="#dbe7fa"
        />
        <text x="16" y="24" fill="#64748b" fontSize="11" fontFamily="sans-serif">
          ARRIVES IN
        </text>
        <text
          x="16"
          y="44"
          fill="#2563eb"
          fontSize="22"
          fontWeight="700"
          fontFamily="sans-serif"
        >
          18 min
        </text>
      </g>

      {/* floating status chip */}
      <g transform="translate(56,84)">
        <rect
          x="0"
          y="0"
          width="118"
          height="40"
          rx="14"
          fill="#fff"
          stroke="#dbe7fa"
        />
        <circle cx="20" cy="20" r="5" fill="#00b25e" />
        <text
          x="34"
          y="24"
          fill="#0f172a"
          fontSize="13"
          fontWeight="600"
          fontFamily="sans-serif"
        >
          On the way
        </text>
      </g>
    </svg>
  );
}
