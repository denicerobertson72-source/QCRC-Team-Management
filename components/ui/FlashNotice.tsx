"use client";

import { useEffect } from "react";

export function FlashNotice({
  status,
  message,
}: {
  status: "success" | "error";
  message: string;
}) {
  useEffect(() => {
    if (message) {
      const key = `qcrc-flash-notice:${status}:${message}`;
      if (window.sessionStorage.getItem(key) === "1") return;
      window.sessionStorage.setItem(key, "1");
      window.alert(message);
    }
  }, [message, status]);

  return <p className={status === "success" ? "success" : "error"}>{message}</p>;
}
