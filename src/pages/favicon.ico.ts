import type { APIRoute } from "astro";
import { avatarPng } from "../lib/avatar-icon";
import { pngToIco } from "../lib/icons";

export const prerender = true;

const size = 32;

export const GET: APIRoute = async () =>
  new Response(pngToIco(await avatarPng(size), size), {
    headers: { "Content-Type": "image/x-icon" },
  });
