"use client";
import Link from "next/link";
import { signOut } from "next-auth/react";

export function TopBar({ name, email }: { name: string; email: string }) {
  const initials = name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "GV";
  return (
    <header className="topbar">
      <Link href="/" className="brand">
        <img src="/brand/logo-full-color.svg" alt="GeoVictoria" />
        <span>Generador de actas</span>
      </Link>
      <div className="user">
        <div className="who" style={{ textAlign: "right", lineHeight: 1.25 }}>
          <div style={{ fontWeight: 600 }}>{name}</div>
          <small>{email}</small>
        </div>
        <span className="avatar" aria-hidden="true">{initials}</span>
        <button className="btn btn-ghost btn-sm" onClick={() => signOut({ callbackUrl: "/login" })}>Cerrar sesión</button>
      </div>
    </header>
  );
}
