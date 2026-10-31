import type { APIRoute } from "astro";
import { touchIconPng } from "../lib/avatar-icon";

export const prerender = true;

export const GET: APIRoute = async () =>
  new Response(await touchIconPng(180), {
    headers: { "Content-Type": "image/png" },
  });
