import { describe, expect, it } from "vitest";
import { swaggerSpec } from "./swagger";

interface OpenApiParameter {
  name?: string;
  deprecated?: boolean;
}

interface OpenApiOperation {
  security?: Array<Record<string, unknown>>;
  parameters?: OpenApiParameter[];
  requestBody?: {
    content?: {
      "application/json"?: {
        schema?: {
          properties?: Record<string, { deprecated?: boolean }>;
        };
      };
    };
  };
}

interface OpenApiDocument {
  paths: Record<string, Record<string, OpenApiOperation>>;
  components?: { securitySchemes?: Record<string, unknown> };
}

describe("OpenAPI auth contract", () => {
  const document = swaggerSpec as OpenApiDocument;

  it("publishes every approved auth endpoint and bearer scheme", () => {
    expect(document.components?.securitySchemes).toHaveProperty("bearerAuth");
    expect(document.paths).toHaveProperty("/v1/auth/register");
    expect(document.paths).toHaveProperty("/v1/auth/login");
    expect(document.paths).toHaveProperty("/v1/auth/refresh");
    expect(document.paths).toHaveProperty("/v1/auth/logout");
    expect(document.paths).toHaveProperty("/v1/me");
  });

  it("protects feed routes and deprecates ignored identity inputs", () => {
    const createPost = document.paths["/v1/feed"]?.post;
    const getFeed = document.paths["/v1/me/feed"]?.get;

    expect(createPost?.security).toEqual([{ bearerAuth: [] }]);
    expect(getFeed?.security).toEqual([{ bearerAuth: [] }]);
    expect(
      createPost?.requestBody?.content?.["application/json"]?.schema?.properties
        ?.authorId?.deprecated,
    ).toBe(true);
    expect(
      getFeed?.parameters?.find((parameter) => parameter.name === "userId")
        ?.deprecated,
    ).toBe(true);
  });
});
