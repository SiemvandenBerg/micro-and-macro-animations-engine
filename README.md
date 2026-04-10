# Micro and Macro Animations Engine

An animation engine for building stylized character motion from a 3D skeleton that is rendered as a clean 2D visual output.

## Status

This repository is initialized and ready for implementation.

## Repository

Suggested GitHub repository name: `micro-and-macro-animations-engine`
Luuk and Siem van both push to main without PR but merge from the latest main before pushing. Commits should be direct and practical, with clear titles. Consider using emoji markers in commit titles if they improve scanability.

## Pitch

The goal of this project is to create a flexible animation engine for designing, editing, and exporting motion in both GIF and Lottie formats. The core idea is a skeleton-driven workflow where the skeleton moves through 3D space while the visible body remains projected in 2D with accurate limb placement.

The engine should also support a vector-based art workflow: create artwork in the tool, export it for editing in Figma, then reimport and overwrite the source asset without breaking the animation pipeline. Animation data should be stored in a JSON structure that can be adapted to Lottie-compatible output and used across design and prototyping workflows.

## Core Goals

- Support a skeleton that moves in 3D space while the rendered character body remains correctly projected in 2D.
- Enable a vector workflow: draw, export, edit in Figma, reimport, and overwrite existing artwork.
- Extract skeleton nodes, bones, and joints into structured JSON data for tooling and debugging.
- Store animation data in a JSON format that is compatible with or translatable to Lottie.
- Export completed animations to both GIF and Lottie.

## Main Engine Functions

Initial high-level function ideas:

- `DrawSkeleton()`
- `DrawVector()`

## Stretch Goals

- Add simple 2D scene objects that can interact with the animated character.
- Generate low-resolution wireframe GIF or Lottie previews for Figma and prototype workflows.
- Trigger particle effects at precise animation moments.
- Track animation movement with a camera system.

## Animation Controls

- Provide a developer view with real-time controls and tweakable parameters.
- Allow color scheme adjustments.
- Allow style toggles for different rendering modes.

## Technical Direction

- Evaluate whether to use an open-source skeleton system as a foundation.
- Investigate converting BVH animation data into a custom internal format.
- Explore using GreenSock where it helps with timeline control or motion tooling.
- Assess whether Adobe Edge Animate has any practical role in the workflow.

## Collaboration And DevOps

- Use a shared repository workflow.
- Keep commits direct and practical, but merge from the latest shared state first.
- Document the VS Code setup for collaborators such as Luuk.
- Use clear naming conventions in titles; emoji-based markers can be considered where they improve scanability.

## AI Tutor Setup

- Configure a GitHub Copilot persona with project instructions, preferences, and memory so the agent can assist consistently during development.

## Onboarding Todo

### Set Up Luuk

- Log in to GitHub Copilot.
- Configure GitHub credentials and token access.
- Set up Git locally.
- Set up task shortcuts.
