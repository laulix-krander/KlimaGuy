import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import React from "react";
import { Nav } from "@/components/ui";

describe("Admin-Navigation", () => {
  it("zeigt Admins den Bereich Administration", () => {
    render(<Nav role="admin" />);

    expect(screen.getByText("Administration")).toBeTruthy();
  });

  it("zeigt Admins die Medien-Inventur", () => {
    render(<Nav role="admin" />);

    expect(screen.getByRole("link", { name: "Medien-Inventur" })).toBeTruthy();
  });

  it("zeigt ausschließlich Admins die Benutzerverwaltung", () => {
    const { rerender } = render(<Nav role="admin" />);
    expect(screen.getByRole("link", { name: "Benutzer & Rollen" }).getAttribute("href")).toBe("/admin/users");
    rerender(<Nav role="reviewer" />);
    expect(screen.queryByRole("link", { name: "Benutzer & Rollen" })).toBeNull();
    rerender(<Nav role={null} />);
    expect(screen.queryByRole("link", { name: "Benutzer & Rollen" })).toBeNull();
  });

  it("verlinkt die Medien-Inventur mit der vorhandenen Adminroute", () => {
    render(<Nav role="admin" />);

    expect(screen.getByRole("link", { name: "Medien-Inventur" }).getAttribute("href"))
      .toBe("/admin/project-media/orphans");
  });

  it("zeigt Reviewern den Bereich Administration und die Medien-Inventur nicht", () => {
    render(<Nav role="reviewer" />);

    expect(screen.queryByText("Administration")).toBeNull();
    expect(screen.queryByRole("link", { name: "Medien-Inventur" })).toBeNull();
  });

  it("zeigt Benutzern ohne gültige Rolle den Bereich Administration nicht", () => {
    render(<Nav role={null} />);

    expect(screen.queryByText("Administration")).toBeNull();
    expect(screen.queryByRole("link", { name: "Medien-Inventur" })).toBeNull();
  });
});
