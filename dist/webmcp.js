/**
 * WebMCP tools for the ML NEWS slide viewer.
 *
 * This module deliberately exposes newsletter-level intents instead of UI
 * gestures: search the issue, inspect the current item, and show an item.
 */

function asText(value) {
  return typeof value === "string" ? value : "";
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean).map(String))];
}

export function buildCatalog(newsletter) {
  const catalog = [];

  for (const section of newsletter?.sections ?? []) {
    if (!section?.name) continue;

    const posts = [];
    for (const item of section.items ?? []) {
      if (Array.isArray(item?.items)) {
        posts.push(...item.items);
      } else if (item?.assets !== undefined) {
        posts.push(item);
      }
    }

    for (const post of posts) {
      const assets = Array.isArray(post.assets) ? post.assets : [];
      const id = post.id == null ? "" : String(post.id);
      const assetSummary = uniqueStrings(
        assets.map((asset) => asText(asset?.alt).trim()),
      ).join("\n\n");

      catalog.push({
        id,
        title: asText(post.title),
        summary: assetSummary || asText(post.summary).trim(),
        section: section.name.toLowerCase(),
        tags: uniqueStrings(assets.flatMap((asset) => asset?.tags ?? [])),
        url: post.url ?? assets.find((asset) => asset?.url)?.url ?? null,
      });
    }
  }

  return catalog;
}

function getCatalog(adapter) {
  const { newsletter } = adapter.getSnapshot();
  if (!newsletter) throw new Error("The newsletter is still loading");
  return buildCatalog(newsletter);
}

export function searchCatalog(catalog, query) {
  const normalizedQuery = asText(query).trim().toLocaleLowerCase();
  if (!normalizedQuery) throw new Error("query must be a non-empty string");

  return catalog.filter((item) =>
    `${item.title}\n${item.summary}`
      .toLocaleLowerCase()
      .includes(normalizedQuery),
  );
}

function findCatalogItem(catalog, id) {
  const itemId = String(id);
  return catalog.find((item) => item.id === itemId) ?? null;
}

function getCurrentItem(adapter, catalog) {
  const { currentSlide } = adapter.getSnapshot();
  if (!currentSlide || currentSlide.postId === "exit") return null;

  const item = adapter.getItem(currentSlide.postId);
  return item ? findCatalogItem(catalog, item.id) : null;
}

function textResult(value) {
  return JSON.stringify(value);
}

async function waitUntilIdle(adapter, signal, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;

  while (adapter.getSnapshot().isAnimating && Date.now() < deadline) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  if (adapter.getSnapshot().isAnimating) {
    throw new Error("The newsletter is still navigating");
  }
}

export async function registerWebMCP(modelContext, adapter) {
  const sharedAnnotations = {
    readOnlyHint: true,
    untrustedContentHint: true,
  };

  await Promise.all([
    modelContext.registerTool({
      name: "search",
      title: "Search ML news",
      description:
        "Search this newsletter's item titles and summaries. Returns matching items with IDs that can be passed to show.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            minLength: 1,
            description: "Text to find in an item's title or summary.",
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
      annotations: sharedAnnotations,
      execute: async ({ query }) => {
        const results = searchCatalog(getCatalog(adapter), query);
        return textResult({ query: query.trim(), total: results.length, results });
      },
    }),

    modelContext.registerTool({
      name: "get",
      title: "Get current ML news item",
      description:
        "Return the structured newsletter item currently visible to the user and its associated tags.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: sharedAnnotations,
      execute: async () => {
        const item = getCurrentItem(adapter, getCatalog(adapter));
        return textResult({ item, tags: item?.tags ?? [] });
      },
    }),

    modelContext.registerTool({
      name: "getItem",
      title: "Get an ML news item",
      description:
        "Return a structured newsletter item and its associated tags by ID without navigating.",
      inputSchema: {
        type: "object",
        properties: {
          id: {
            type: "string",
            minLength: 1,
            description: "Newsletter item ID returned by search.",
          },
        },
        required: ["id"],
        additionalProperties: false,
      },
      annotations: sharedAnnotations,
      execute: async ({ id }) => {
        const sourceItem = adapter.getItem(id);
        if (!sourceItem) throw new Error(`News item not found: ${id}`);

        const item = findCatalogItem(getCatalog(adapter), sourceItem.id);
        if (!item) throw new Error(`News item not found: ${id}`);

        return textResult({ item, tags: item.tags });
      },
    }),

    modelContext.registerTool({
      name: "listItems",
      title: "List ML news items",
      description:
        "List lightweight metadata for every newsletter item without navigating.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: sharedAnnotations,
      execute: async () => {
        const items = getCatalog(adapter).map(
          ({ id, title, summary, section, tags }) => ({
            id,
            title,
            summary,
            section,
            tags,
          }),
        );
        return textResult({ total: items.length, items });
      },
    }),

    modelContext.registerTool({
      name: "next",
      title: "Show next ML news slide",
      description:
        "Navigate to the next slide relative to the currently visible slide.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: false,
        untrustedContentHint: true,
      },
      execute: async (_, { signal } = {}) => {
        await waitUntilIdle(adapter, signal);
        const moved = adapter.next();
        const item = getCurrentItem(adapter, getCatalog(adapter));
        return textResult({ moved, item, tags: item?.tags ?? [] });
      },
    }),

    modelContext.registerTool({
      name: "previous",
      title: "Show previous ML news slide",
      description:
        "Navigate to the previous slide relative to the currently visible slide.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: false,
        untrustedContentHint: true,
      },
      execute: async (_, { signal } = {}) => {
        await waitUntilIdle(adapter, signal);
        const moved = adapter.previous();
        const item = getCurrentItem(adapter, getCatalog(adapter));
        return textResult({ moved, item, tags: item?.tags ?? [] });
      },
    }),

    modelContext.registerTool({
      name: "filter",
      title: "Filter ML news by tag",
      description:
        "Show only items associated with a tag. Omit the tag to disable filtering and show all items. An unknown tag returns an error without changing the current filter.",
      inputSchema: {
        type: "object",
        properties: {
          tag: {
            type: "string",
            minLength: 1,
            description: "Tag to filter by. Omit to disable filtering.",
          },
        },
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: false,
        untrustedContentHint: true,
      },
      execute: async ({ tag } = {}, { signal } = {}) => {
        await waitUntilIdle(adapter, signal);
        return textResult(adapter.filter(tag));
      },
    }),

    modelContext.registerTool({
      name: "activateCustomView",
      title: "Activate a custom ML news view",
      description:
        "Build and show a special issue from an ordered list of item IDs. Selecting any item in a bundle includes the complete bundle in its original order. Repeated items and bundles are deduplicated at their first requested position; unknown IDs are ignored unless none are valid.",
      inputSchema: {
        type: "object",
        properties: {
          ids: {
            type: "array",
            minItems: 1,
            items: {
              type: "string",
              minLength: 1,
            },
            description:
              "Ordered newsletter item IDs used to compose the custom view.",
          },
        },
        required: ["ids"],
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: false,
        untrustedContentHint: true,
      },
      execute: async ({ ids }, { signal } = {}) => {
        await waitUntilIdle(adapter, signal);
        const result = adapter.activateCustomView(ids);
        const item = getCurrentItem(adapter, getCatalog(adapter));
        return textResult({ ...result, item, tags: item?.tags ?? [] });
      },
    }),

    modelContext.registerTool({
      name: "deactivateCustomView",
      title: "Deactivate the custom ML news view",
      description:
        "Close the special issue and restore the exact regular view, filter, and slide that were active before it was opened.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: false,
        untrustedContentHint: true,
      },
      execute: async (_, { signal } = {}) => {
        await waitUntilIdle(adapter, signal);
        const result = adapter.deactivateCustomView();
        const item = getCurrentItem(adapter, getCatalog(adapter));
        return textResult({ ...result, item, tags: item?.tags ?? [] });
      },
    }),

    modelContext.registerTool({
      name: "show",
      title: "Show an ML news item",
      description:
        "Navigate the newsletter to an item by the ID returned by search.",
      inputSchema: {
        type: "object",
        properties: {
          id: {
            type: "string",
            minLength: 1,
            description: "Newsletter item ID returned by search.",
          },
        },
        required: ["id"],
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: false,
        untrustedContentHint: true,
      },
      execute: async ({ id }, { signal } = {}) => {
        const item = adapter.getItem(id);
        if (!item) throw new Error(`News item not found: ${id}`);

        const catalog = getCatalog(adapter);
        const requestedItem = findCatalogItem(catalog, item.id);
        if (!requestedItem) throw new Error(`News item not found: ${id}`);

        await waitUntilIdle(adapter, signal);
        if (!adapter.showItem(id)) throw new Error(`News item not found: ${id}`);

        return textResult({ item: requestedItem });
      },
    }),
  ]);
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  const adapter = window.newsletterWebMCPAdapter;
  if (document.modelContext && adapter) {
    registerWebMCP(document.modelContext, adapter).catch((error) => {
      console.error("Failed to register WebMCP tools:", error);
    });
  }
}
