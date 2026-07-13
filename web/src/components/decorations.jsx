const base = {
  viewBox: "0 0 24 24",
  xmlns: "http://www.w3.org/2000/svg",
  "aria-hidden": true,
};

export function Sparkle({ size = 24, color = "#ec9db5" }) {
  return (
    <svg {...base} width={size} height={size}>
      <path
        d="M12 1c1 6.2 4.8 10 11 11-6.2 1-10 4.8-11 11-1-6.2-4.8-10-11-11 6.2-1 10-4.8 11-11Z"
        fill={color}
      />
    </svg>
  );
}

export function Star({ size = 24, color = "#f4ce56" }) {
  return (
    <svg {...base} width={size} height={size}>
      <path
        d="M12 2.2 14.7 8l6.3.6-4.7 4.2 1.4 6.2L12 15.7 6.3 19l1.4-6.2L3 8.6 9.3 8 12 2.2Z"
        fill={color}
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Cloud({ size = 24, color = "#c5e2fb" }) {
  return (
    <svg {...base} width={size} height={size}>
      <path
        d="M6.6 18.5a4.6 4.6 0 0 1-.5-9.2A6.2 6.2 0 0 1 18 8.6a4.3 4.3 0 0 1-.4 9.9H6.6Z"
        fill={color}
      />
    </svg>
  );
}

export function Carrot({ size = 24 }) {
  return (
    <svg {...base} width={size} height={size}>
      <ellipse cx="9.4" cy="5.6" rx="1.7" ry="2.9" transform="rotate(-32 9.4 5.6)" fill="#9fdcba" />
      <ellipse cx="14.6" cy="5.6" rx="1.7" ry="2.9" transform="rotate(32 14.6 5.6)" fill="#9fdcba" />
      <ellipse cx="12" cy="4.8" rx="1.7" ry="3.1" fill="#b9e8cd" />
      <path
        d="M8.6 8.8q3.4-1.7 6.8 0l-2.4 12.1q-.9 2.1-1.9 0L8.6 8.8Z"
        fill="#f7b06a"
      />
    </svg>
  );
}

export function Heart({ size = 24, color = "#f6a8bf" }) {
  return (
    <svg {...base} width={size} height={size}>
      <path
        d="M12 20.6C5.6 15.4 3 11.2 5.7 7.9 8 5.2 11.6 6.7 12 9.5c.4-2.8 4-4.3 6.3-1.6 2.7 3.3.1 7.5-6.3 12.7Z"
        fill={color}
      />
    </svg>
  );
}

export function Paw({ size = 24, color = "#f3b8c9" }) {
  return (
    <svg {...base} width={size} height={size}>
      <circle cx="6.2" cy="9" r="2.3" fill={color} />
      <circle cx="12" cy="6.6" r="2.5" fill={color} />
      <circle cx="17.8" cy="9" r="2.3" fill={color} />
      <path
        d="M12 11.2c3.4 0 6.2 2.5 6.2 5 0 1.9-1.6 3-3.2 2.5-1.2-.4-1.8-.6-3-.6s-1.8.2-3 .6c-1.6.5-3.2-.6-3.2-2.5 0-2.5 2.8-5 6.2-5Z"
        fill={color}
      />
    </svg>
  );
}

export function Flower({ size = 24, petal = "#ffd9e3", center = "#f4ce56" }) {
  return (
    <svg {...base} width={size} height={size}>
      <circle cx="12" cy="5.5" r="3.6" fill={petal} />
      <circle cx="18.2" cy="10" r="3.6" fill={petal} />
      <circle cx="15.8" cy="17.3" r="3.6" fill={petal} />
      <circle cx="8.2" cy="17.3" r="3.6" fill={petal} />
      <circle cx="5.8" cy="10" r="3.6" fill={petal} />
      <circle cx="12" cy="11.8" r="3" fill={center} />
    </svg>
  );
}
