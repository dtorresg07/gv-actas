"use client";
import Link from "next/link";
import { signOut } from "next-auth/react";

export function TopBar({ name, email }: { name: string; email: string }) {
  return (
    <header className="topbar">
      <Link href="/" className="brand" style={{ color: "#fff", textDecoration: "none" }}>
        <img src="/brand/logo-full-color.svg" alt="GeoVictoria" />
        <span>Generador de actas</span>
      </Link>
      <div className="user">
        <div style={{ textAlign: "right" }}>
          <div>{name}</div>
          <small>{email}</small>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => signOut({ callbackUrl: "/login" })}>Cerrar sesión</button>
      </div>
    </header>
  );
}
