// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProjectConversation } from "@/app/(app)/projects/[id]/project-conversation";
import { ProjectFacts } from "@/app/(app)/projects/[id]/project-facts";

describe("Project Workspace UI", () => {
  it("bietet semantische Überschriften und hilfreiche Empty States", () => {
    render(<><ProjectConversation conversations={[]} /><ProjectFacts facts={[]} /></>);
    expect(screen.getByRole("heading", { name: "Conversation" })).toBeTruthy();
    expect(screen.getByText(/noch keine Conversation/i)).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Angaben & Fakten/i })).toBeTruthy();
    expect(screen.getAllByText("Noch nicht bekannt").length).toBeGreaterThan(0);
  });
});
