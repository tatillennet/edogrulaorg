// frontend/src/components/SafeImg.jsx
import React from "react";

export default function SafeImg({ src, ...rest }) {
  const safeSrc = String(src || "").replace(/^\/+/, "/"); // //uploads/...  -> /uploads/...
  return <img src={safeSrc} {...rest} />;
}
