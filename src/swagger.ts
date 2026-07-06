import swaggerJsdoc from "swagger-jsdoc";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Scalable News Feed API",
      version: "1.0.0",
      description: "A scalable news feed system with fan-out delivery",
    },
    servers: [
      { url: "http://localhost:3000", description: "Local dev server" },
    ],
  },
  apis: ["./src/modules/**/*.ts"],
};

export const swaggerSpec = swaggerJsdoc(options);
