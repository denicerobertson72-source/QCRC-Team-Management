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
      window.alert(message);
    }
  }, [message]);

  return <p className={status === "success" ? "success" : "error"}>{message}</p>;
}
