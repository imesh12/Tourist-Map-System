import { describe, expect, it } from 'vitest';
import { pageCreateInputSchema, pageSchema, pageUpdateInputSchema } from './page';

const validPage = {
  pageId: 'page_aB3dEf6gH9jKlMn0pQ',
  customerId: 'cust_aB3dEf6gH9jKlMn0pQ',
  mapId: 'map_aB3dEf6gH9jKlMn0pQ',
  title: 'Shuttle Bus Information',
  content: 'Free shuttle buses operate between Beppu Station and the hotel.\n07:00 - 22:00',
  status: 'ENABLED',
  createdAt: { seconds: 1700000000, nanoseconds: 0 },
  updatedAt: { seconds: 1700000001, nanoseconds: 0 },
};

const validCreateInput = {
  title: 'Shuttle Bus Information',
  content: 'Free shuttle buses operate between Beppu Station and the hotel.',
};

describe('pageSchema', () => {
  it('accepts a valid Page document', () => {
    expect(pageSchema.safeParse(validPage).success).toBe(true);
  });

  it('rejects an unrecognized status', () => {
    expect(pageSchema.safeParse({ ...validPage, status: 'ARCHIVED' }).success).toBe(false);
  });

  it('rejects a malformed pageId', () => {
    expect(pageSchema.safeParse({ ...validPage, pageId: 'not-a-page-id' }).success).toBe(false);
  });
});

describe('pageCreateInputSchema', () => {
  it('accepts a minimal valid create input', () => {
    expect(pageCreateInputSchema.safeParse(validCreateInput).success).toBe(true);
  });

  it('accepts an explicit status', () => {
    expect(pageCreateInputSchema.safeParse({ ...validCreateInput, status: 'DISABLED' }).success).toBe(true);
  });

  it('rejects a missing title', () => {
    const { title, ...rest } = validCreateInput;
    void title;
    expect(pageCreateInputSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects an empty/whitespace-only title', () => {
    expect(pageCreateInputSchema.safeParse({ ...validCreateInput, title: '   ' }).success).toBe(false);
  });

  it('rejects an oversized title', () => {
    expect(pageCreateInputSchema.safeParse({ ...validCreateInput, title: 'a'.repeat(151) }).success).toBe(false);
  });

  it('rejects a missing content', () => {
    const { content, ...rest } = validCreateInput;
    void content;
    expect(pageCreateInputSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects an empty/whitespace-only content', () => {
    expect(pageCreateInputSchema.safeParse({ ...validCreateInput, content: '   ' }).success).toBe(false);
  });

  it('rejects oversized content', () => {
    expect(pageCreateInputSchema.safeParse({ ...validCreateInput, content: 'a'.repeat(10_001) }).success).toBe(false);
  });

  it('accepts content at the maximum bound', () => {
    expect(pageCreateInputSchema.safeParse({ ...validCreateInput, content: 'a'.repeat(10_000) }).success).toBe(true);
  });

  it('rejects an invalid status', () => {
    expect(pageCreateInputSchema.safeParse({ ...validCreateInput, status: 'ARCHIVED' }).success).toBe(false);
  });

  it('rejects a malformed payload (title not a string)', () => {
    expect(pageCreateInputSchema.safeParse({ ...validCreateInput, title: 42 }).success).toBe(false);
  });

  describe('security: identity/ownership fields are never client-suppliable', () => {
    it('rejects an injected pageId', () => {
      expect(pageCreateInputSchema.safeParse({ ...validCreateInput, pageId: 'page_attackerControlled01' }).success).toBe(false);
    });

    it('rejects an injected customerId', () => {
      expect(pageCreateInputSchema.safeParse({ ...validCreateInput, customerId: 'cust_attackerControlled01' }).success).toBe(false);
    });

    it('rejects an injected mapId', () => {
      expect(pageCreateInputSchema.safeParse({ ...validCreateInput, mapId: 'map_attackerControlled01' }).success).toBe(false);
    });

    it('rejects injected createdAt/updatedAt', () => {
      expect(pageCreateInputSchema.safeParse({ ...validCreateInput, createdAt: 'x' }).success).toBe(false);
      expect(pageCreateInputSchema.safeParse({ ...validCreateInput, updatedAt: 'x' }).success).toBe(false);
    });

    it('rejects any other unrecognized extra field (strict mode)', () => {
      expect(pageCreateInputSchema.safeParse({ ...validCreateInput, isAdmin: true }).success).toBe(false);
    });
  });
});

describe('pageUpdateInputSchema', () => {
  it('accepts a partial update with only status', () => {
    expect(pageUpdateInputSchema.safeParse({ status: 'DISABLED' }).success).toBe(true);
  });

  it('accepts a partial update with only title', () => {
    expect(pageUpdateInputSchema.safeParse({ title: 'New title' }).success).toBe(true);
  });

  it('accepts a partial update with only content', () => {
    expect(pageUpdateInputSchema.safeParse({ content: 'New content' }).success).toBe(true);
  });

  it('rejects an empty update object', () => {
    expect(pageUpdateInputSchema.safeParse({}).success).toBe(false);
  });

  it('rejects an empty/whitespace-only title when provided', () => {
    expect(pageUpdateInputSchema.safeParse({ title: '   ' }).success).toBe(false);
  });

  it('rejects an empty/whitespace-only content when provided', () => {
    expect(pageUpdateInputSchema.safeParse({ content: '   ' }).success).toBe(false);
  });

  it('rejects an invalid status', () => {
    expect(pageUpdateInputSchema.safeParse({ status: 'ARCHIVED' }).success).toBe(false);
  });

  describe('security: ownership fields are never client-suppliable on update', () => {
    it('rejects an injected pageId', () => {
      expect(pageUpdateInputSchema.safeParse({ status: 'ENABLED', pageId: 'page_x' }).success).toBe(false);
    });

    it('rejects an injected customerId', () => {
      expect(pageUpdateInputSchema.safeParse({ status: 'ENABLED', customerId: 'cust_x' }).success).toBe(false);
    });

    it('rejects an injected mapId (cross-map move attempt)', () => {
      expect(pageUpdateInputSchema.safeParse({ status: 'ENABLED', mapId: 'map_x' }).success).toBe(false);
    });

    it('rejects injected createdAt/updatedAt', () => {
      expect(pageUpdateInputSchema.safeParse({ status: 'ENABLED', createdAt: 'x' }).success).toBe(false);
      expect(pageUpdateInputSchema.safeParse({ status: 'ENABLED', updatedAt: 'x' }).success).toBe(false);
    });
  });
});
