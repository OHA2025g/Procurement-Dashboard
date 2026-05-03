import React, { useEffect, useState } from "react";

/** Simple count-up for integer KPI values */
export default function AnimatedNumber({ value, decimals = 0 }) {
  const [n, setN] = useState(value);
  useEffect(() => {
    setN(value);
  }, [value]);
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return <span>{Number(n).toFixed(decimals)}</span>;
}
