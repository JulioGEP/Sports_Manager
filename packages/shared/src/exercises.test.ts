import { describe, expect, it } from "vitest";
import { ExerciseCreateSchema, ExerciseUpdateSchema, exerciseEmbedUrl } from "./exercises.ts";

describe("biblioteca de ejercicios", () => {
  it("un ejercicio pide nombre y categoría; el material va sin repetir códigos desconocidos", () => {
    expect(
      ExerciseCreateSchema.parse({ name: " Wall ball ", category: "accessory" }),
    ).toMatchObject({
      name: "Wall ball",
      equipment: [],
    });
    expect(ExerciseCreateSchema.safeParse({ name: "", category: "accessory" }).success).toBe(false);
    expect(
      ExerciseCreateSchema.safeParse({ name: "X", category: "accessory", equipment: ["balon"] })
        .success,
    ).toBe(false);
    expect(
      ExerciseCreateSchema.safeParse({ name: "X", category: "strength", movementCode: "nope" })
        .success,
    ).toBe(false);
    expect(
      ExerciseCreateSchema.safeParse({ name: "X", category: "strength", videoUrl: "ftp://a" })
        .success,
    ).toBe(false);
  });

  it("cambiar un ejercicio pide algo que cambiar", () => {
    expect(ExerciseUpdateSchema.safeParse({}).success).toBe(false);
    expect(ExerciseUpdateSchema.parse({ status: "archived" })).toEqual({ status: "archived" });
  });

  it("YouTube y Vimeo se incrustan; el resto, no", () => {
    expect(exerciseEmbedUrl("https://www.youtube.com/watch?v=abc123")).toBe(
      "https://www.youtube-nocookie.com/embed/abc123",
    );
    expect(exerciseEmbedUrl("https://youtu.be/abc123")).toBe(
      "https://www.youtube-nocookie.com/embed/abc123",
    );
    expect(exerciseEmbedUrl("https://youtube.com/shorts/xyz")).toBe(
      "https://www.youtube-nocookie.com/embed/xyz",
    );
    expect(exerciseEmbedUrl("https://vimeo.com/123456789")).toBe(
      "https://player.vimeo.com/video/123456789",
    );
    expect(exerciseEmbedUrl("https://example.com/video.mp4")).toBeNull();
    expect(exerciseEmbedUrl("no es una url")).toBeNull();
    expect(exerciseEmbedUrl(null)).toBeNull();
  });
});
