import { expect, test } from 'bun:test';
import z from 'zod';
import * as Y from 'yjs';
import { table, type Row } from './table';
import { any, eq, getKey, or, select, watch } from './view';
import { remove, update, upsert } from './update';

const SimpleTable = table(
    'simple',
    z.object({
        key: z.string(),
        foo: z.boolean(),
        bar: z.string(),
    }),
);

const ComplexTable = table(
    'complex',
    z.object({
        key: z.string(),
        rawMap: z.instanceof(Y.Map).meta({ syncAs: Y.Map }),
        convertedMap: z.object({
            test: z.string(),
            another: z.string(),
        }),
        notMapAtAll: z.object({
            test: z.string(),
        }),
    }),
);

test('Empty table', () => {
    const doc = new Y.Doc();
    expect(select(doc, SimpleTable, any())).toBeEmpty();
    expect(select(doc, ComplexTable, any())).toBeEmpty();
});

test('Simple content', () => {
    const doc = new Y.Doc();
    expect(select(doc, SimpleTable, any())).toBeEmpty();

    // Put one thing to table and make sure it is there
    const first = {
        key: '123',
        foo: true,
        bar: 'baz',
    };
    upsert(doc, SimpleTable, first);
    expect(select(doc, SimpleTable, any())).toEqual([first]);

    // Put another and make sure both are there
    const second = {
        key: '456',
        foo: false,
        bar: 'test',
    };
    upsert(doc, SimpleTable, second);
    expect(select(doc, SimpleTable, any())).toHaveLength(2);

    // Test a few queries against the two things
    expect(select(doc, SimpleTable, eq('foo', true))).toEqual([first]);
    expect(select(doc, SimpleTable, eq('foo', false))).toEqual([second]);
    expect(
        select(doc, SimpleTable, or(eq('foo', false), eq('bar', 'baz'))),
    ).toHaveLength(2);

    // Make sure the other table was not affected
    expect(select(doc, ComplexTable, any())).toBeEmpty();
});

test('Complex content', () => {
    const doc = new Y.Doc();
    expect(select(doc, ComplexTable, any())).toBeEmpty();

    // Put a thing to table and make sure it is there
    const first = {
        key: '123',
        rawMap: new Y.Map(),
        convertedMap: {
            test: 'hello',
            another: 'foo',
        },
        notMapAtAll: {
            test: 'world',
        },
    };
    upsert(doc, ComplexTable, first);
    const selectedFirst = select(doc, ComplexTable, any())[0];
    expect(selectedFirst?.key).toBe(first.key);

    // Check that raw map is attached to Y.Doc for selected row
    expect(selectedFirst?.rawMap.doc).toBe(doc);
    selectedFirst?.rawMap.set('foo', 'bar');

    // ... and that if we select again, the value is same
    expect(select(doc, ComplexTable, any())[0]?.rawMap.get('foo')).toBe('bar');
});

test('Simple updates', () => {
    const doc = new Y.Doc();

    const first = {
        key: '123',
        foo: true,
        bar: 'one',
    };
    upsert(doc, SimpleTable, first);
    const second = {
        key: '456',
        foo: false,
        bar: 'two',
    };
    upsert(doc, SimpleTable, second);
    upsert(doc, SimpleTable, {
        key: '789',
        foo: true,
        bar: 'three',
    });

    // No-op update
    update(doc, SimpleTable, {
        key: '123',
    });
    expect(getKey(doc, SimpleTable, '123')).toEqual(first);

    // Update to first
    update(doc, SimpleTable, {
        key: '123',
        bar: 'updated!',
    });
    expect(getKey(doc, SimpleTable, '123')).not.toEqual(first);
    expect(getKey(doc, SimpleTable, '123')?.bar).toBe('updated!');
    expect(getKey(doc, SimpleTable, '456')).toEqual(second);
});

test('Nested Y.Map updates', () => {
    const doc = new Y.Doc();
    upsert(doc, ComplexTable, {
        key: '123',
        rawMap: new Y.Map(),
        convertedMap: {
            test: 'hello',
            another: 'foo',
        },
        notMapAtAll: {
            test: 'world',
        },
    });
    upsert(doc, ComplexTable, {
        key: '456',
        rawMap: new Y.Map(),
        convertedMap: {
            test: 'second',
            another: 'foo',
        },
        notMapAtAll: {
            test: 'world',
        },
    });

    update(doc, ComplexTable, {
        key: '123',
        convertedMap: {
            test: 'updated',
        },
    });
    expect(getKey(doc, ComplexTable, '123')?.convertedMap).toEqual({
        test: 'updated',
        another: 'foo',
    });
});

test('Key-level watching', () => {
    const doc = new Y.Doc();

    const addedRows: Row<typeof SimpleTable>[] = [];
    const removedRows: Row<typeof SimpleTable>[] = [];
    const changedRows: Row<typeof SimpleTable>[] = [];
    watch(
        doc,
        SimpleTable,
        eq('foo', true),
        'keys',
        (added, removed, changed) => {
            addedRows.push(...added);
            removedRows.push(...removed);
            changedRows.push(...changed);
        },
    );

    // Add stuff that will trigger watcher
    const first = {
        key: '123',
        foo: true,
        bar: 'one',
    };
    upsert(doc, SimpleTable, first);
    // And some that won't!
    const second = {
        key: '456',
        foo: false,
        bar: 'two',
    };
    upsert(doc, SimpleTable, second);
    const third = {
        key: '789',
        foo: true,
        bar: 'three',
    };
    upsert(doc, SimpleTable, third);

    // We should have two additions and no changes or removals
    expect(addedRows).toHaveLength(2);
    expect(addedRows).toContainAllValues([first, third]);
    expect(removedRows).toHaveLength(0);
    expect(changedRows).toHaveLength(0);

    // Delete one!
    remove(doc, SimpleTable, '123');
    expect(addedRows).toHaveLength(2);
    expect(removedRows).toHaveLength(1);
    expect(removedRows).toContainAllValues([first]);
    expect(changedRows).toHaveLength(0);

    // Make sure it is actually gone
    expect(getKey(doc, SimpleTable, '123')).toBeNull();

    // Delete one that isn't watched (i.e. no-op for watcher)
    remove(doc, SimpleTable, '456');
    expect(addedRows).toHaveLength(2);
    expect(removedRows).toHaveLength(1);
    expect(changedRows).toHaveLength(0);
});

test('Shallow content watching', () => {
    const doc = new Y.Doc();

    const addedRows: Row<typeof SimpleTable>[] = [];
    const removedRows: Row<typeof SimpleTable>[] = [];
    const changedRows: Row<typeof SimpleTable>[] = [];
    watch(
        doc,
        SimpleTable,
        eq('foo', true),
        'content',
        (added, removed, changed) => {
            addedRows.push(...added);
            removedRows.push(...removed);
            changedRows.push(...changed);
        },
    );

    // Add stuff that will trigger watcher
    const first = {
        key: '123',
        foo: true,
        bar: 'one',
    };
    upsert(doc, SimpleTable, first);
    // And some that won't!
    const second = {
        key: '456',
        foo: false,
        bar: 'two',
    };
    upsert(doc, SimpleTable, second);
    const third = {
        key: '789',
        foo: true,
        bar: 'three',
    };
    upsert(doc, SimpleTable, third);

    // Same additions as if we were key-level watching
    expect(addedRows).toHaveLength(2);
    expect(addedRows).toContainAllValues([first, third]);
    expect(removedRows).toHaveLength(0);
    expect(changedRows).toHaveLength(0);

    // Now make some changes!
    update(doc, SimpleTable, {
        key: '123',
        bar: 'updated',
    });
    expect(addedRows).toHaveLength(2);
    expect(removedRows).toHaveLength(0);
    expect(changedRows).toEqual([
        {
            key: '123',
            foo: true,
            bar: 'updated',
        },
    ]);

    // Make changes that shouldn't affect anything
    update(doc, SimpleTable, {
        key: '456',
        bar: 'updated2',
    });
    expect(addedRows).toHaveLength(2);
    expect(removedRows).toHaveLength(0);
    expect(changedRows).toHaveLength(1);

    // Make a change that causes third no longer to be watched
    // This should emit removal, NOT change!
    update(doc, SimpleTable, {
        key: '789',
        foo: false,
    });
    expect(addedRows).toHaveLength(2);
    expect(removedRows).toEqual([third]);
    expect(changedRows).toHaveLength(1);

    // TODO test row reappearing once that is supported

    // Delete one for real
    remove(doc, SimpleTable, '123');
    expect(addedRows).toHaveLength(2);
    expect(removedRows).toHaveLength(2);
    expect(changedRows).toHaveLength(1);

    // Make sure it is actually gone
    expect(getKey(doc, SimpleTable, '123')).toBeNull();

    // Delete one that isn't watched (should still be no-op)
    remove(doc, SimpleTable, '456');
    expect(addedRows).toHaveLength(2);
    expect(removedRows).toHaveLength(2);
    expect(changedRows).toHaveLength(1);
});

// Test auto-inferred syncAs: Y.Map for nested objects
test('Auto-inferred nested Y.Map updates', () => {
    const doc = new Y.Doc();
    upsert(doc, ComplexTable, {
        key: '123',
        rawMap: new Y.Map(),
        convertedMap: {
            test: 'hello',
            another: 'foo',
        },
        notMapAtAll: {
            test: 'world',
        },
    });

    // notMapAtAll now gets auto-inferred syncAs: Y.Map behavior
    // So partial updates should merge, not replace
    update(doc, ComplexTable, {
        key: '123',
        notMapAtAll: {
            test: 'updated',
        },
    });

    // The field should be updated (previously it would have stayed 'world' with LWW)
    expect(getKey(doc, ComplexTable, '123')?.notMapAtAll).toEqual({
        test: 'updated',
    });
});

// Test shallow: true opt-out
const ShallowTable = table(
    'shallow',
    z.object({
        key: z.string(),
        nestedWithCRDT: z.object({
            a: z.string(),
            b: z.string(),
        }),
        nestedShallow: z
            .object({
                a: z.string(),
                b: z.string(),
            })
            .meta({ shallow: true }),
    }),
);

test('Shallow opt-out for nested objects', () => {
    const doc = new Y.Doc();
    upsert(doc, ShallowTable, {
        key: '123',
        nestedWithCRDT: { a: 'one', b: 'two' },
        nestedShallow: { a: 'one', b: 'two' },
    });

    // Update only 'a' in nestedWithCRDT (should merge, keeping 'b')
    update(doc, ShallowTable, {
        key: '123',
        nestedWithCRDT: { a: 'updated' },
    });

    // nestedWithCRDT should merge (keep 'b')
    expect(getKey(doc, ShallowTable, '123')?.nestedWithCRDT).toEqual({
        a: 'updated',
        b: 'two',
    });

    // Now update nestedShallow - with shallow: true, the entire object is replaced
    // We must provide all fields to satisfy schema validation
    update(doc, ShallowTable, {
        key: '123',
        nestedShallow: { a: 'changed', b: 'also changed' },
    });

    // Verify the shallow object was replaced entirely
    expect(getKey(doc, ShallowTable, '123')?.nestedShallow).toEqual({
        a: 'changed',
        b: 'also changed',
    });

    // Also verify the underlying storage: shallow uses the row Y.Map directly
    const row = doc.getMap('shallow.123');
    expect(row.get('nestedShallow')).toEqual({
        a: 'changed',
        b: 'also changed',
    });

    // While CRDT uses a separate Y.Map
    const nestedCrdtMap = doc.getMap('shallow.123.nestedWithCRDT');
    expect(Object.fromEntries(nestedCrdtMap.entries())).toEqual({
        a: 'updated',
        b: 'two',
    });
});

// Test watching nested Y.Map changes at 'content' level
test('Content-level watching detects nested Y.Map changes', () => {
    const doc = new Y.Doc();

    const changedRows: Row<typeof ComplexTable>[] = [];
    watch(doc, ComplexTable, any(), 'content', (_added, _removed, changed) => {
        changedRows.push(...changed);
    });

    upsert(doc, ComplexTable, {
        key: '123',
        rawMap: new Y.Map(),
        convertedMap: {
            test: 'hello',
            another: 'foo',
        },
        notMapAtAll: {
            test: 'world',
        },
    });

    // Clear the added rows (we're interested in changes)
    changedRows.length = 0;

    // Update the convertedMap nested field
    update(doc, ComplexTable, {
        key: '123',
        convertedMap: { test: 'updated' },
    });

    // The watcher should detect the change
    expect(changedRows).toHaveLength(1);
    expect(changedRows[0]?.convertedMap.test).toBe('updated');

    changedRows.length = 0;

    // Update the auto-inferred notMapAtAll nested field
    update(doc, ComplexTable, {
        key: '123',
        notMapAtAll: { test: 'also updated' },
    });

    // The watcher should also detect this change
    expect(changedRows).toHaveLength(1);
    expect(changedRows[0]?.notMapAtAll.test).toBe('also updated');
});

// Test nested z.discriminatedUnion support
const UnionTable = table(
    'union',
    z.object({
        key: z.string(),
        variant: z.discriminatedUnion('type', [
            z.object({ type: z.literal('text'), content: z.string() }),
            z.object({ type: z.literal('number'), value: z.number() }),
        ]),
    }),
);

test('Nested discriminatedUnion - basic read/write', () => {
    const doc = new Y.Doc();

    // Insert a text variant
    upsert(doc, UnionTable, {
        key: '123',
        variant: { type: 'text', content: 'hello world' },
    });

    const result1 = getKey(doc, UnionTable, '123');
    expect(result1?.variant).toEqual({ type: 'text', content: 'hello world' });

    // Insert a number variant
    upsert(doc, UnionTable, {
        key: '456',
        variant: { type: 'number', value: 42 },
    });

    const result2 = getKey(doc, UnionTable, '456');
    expect(result2?.variant).toEqual({ type: 'number', value: 42 });

    // Verify storage - should be in separate Y.Map
    const variantMap = doc.getMap('union.123.variant');
    expect(variantMap.get('type')).toBe('text');
    expect(variantMap.get('content')).toBe('hello world');
});

test('Nested discriminatedUnion - partial updates merge within variant', () => {
    const doc = new Y.Doc();

    upsert(doc, UnionTable, {
        key: '123',
        variant: { type: 'text', content: 'original' },
    });

    // Update only the content field (type stays the same)
    update(doc, UnionTable, {
        key: '123',
        variant: { type: 'text', content: 'updated' },
    });

    const result = getKey(doc, UnionTable, '123');
    expect(result?.variant).toEqual({ type: 'text', content: 'updated' });
});

test('Nested discriminatedUnion - switching variants', () => {
    const doc = new Y.Doc();

    // Start with text variant
    upsert(doc, UnionTable, {
        key: '123',
        variant: { type: 'text', content: 'hello' },
    });

    expect(getKey(doc, UnionTable, '123')?.variant).toEqual({
        type: 'text',
        content: 'hello',
    });

    // Switch to number variant
    update(doc, UnionTable, {
        key: '123',
        variant: { type: 'number', value: 99 },
    });

    const result = getKey(doc, UnionTable, '123');
    expect(result?.variant.type).toBe('number');
    expect((result?.variant as any).value).toBe(99);
});

test('Nested discriminatedUnion - watching detects changes', () => {
    const doc = new Y.Doc();

    const changedRows: Row<typeof UnionTable>[] = [];
    watch(doc, UnionTable, any(), 'content', (_added, _removed, changed) => {
        changedRows.push(...changed);
    });

    upsert(doc, UnionTable, {
        key: '123',
        variant: { type: 'text', content: 'initial' },
    });

    changedRows.length = 0;

    // Update the variant
    update(doc, UnionTable, {
        key: '123',
        variant: { type: 'text', content: 'changed' },
    });

    expect(changedRows).toHaveLength(1);
    expect((changedRows[0]?.variant as any).content).toBe('changed');
});
