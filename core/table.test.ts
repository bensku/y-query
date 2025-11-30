import { expect, test } from "bun:test";
import z from "zod";
import * as Y from 'yjs';
import { table, type Row } from "./table";
import { any, eq, getKey, or, select, watch } from "./view";
import { remove, update, upsert } from "./update";

const SimpleTable = table('simple', z.object({
    key: z.string(),
    foo: z.boolean(),
    bar: z.string(),
}));

const ComplexTable = table('complex', z.object({
    key: z.string(),
    rawMap: z.instanceof(Y.Map).meta({ syncAs: Y.Map }),
    convertedMap: z.object({
        test: z.string(),
        another: z.string(),
    }).meta({ syncAs: Y.Map }),
    notMapAtAll: z.object({
        test: z.string(),
    }),
}));

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
        bar: 'baz'
    };
    upsert(doc, SimpleTable, first);
    expect(select(doc, SimpleTable, any())).toEqual([first]);

    // Put another and make sure both are there
    const second = {
        key: '456',
        foo: false,
        bar: 'test'
    };
    upsert(doc, SimpleTable, second);
    expect(select(doc, SimpleTable, any())).toHaveLength(2);

    // Test a few queries against the two things
    expect(select(doc, SimpleTable, eq('foo', true))).toEqual([first]);
    expect(select(doc, SimpleTable, eq('foo', false))).toEqual([second]);
    expect(select(doc, SimpleTable, or(eq('foo', false), eq('bar', 'baz')))).toHaveLength(2);

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
            another: 'foo'
        },
        notMapAtAll: {
            test: 'world'
        }
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
        bar: 'one'
    };
    upsert(doc, SimpleTable, first);
    const second = {
        key: '456',
        foo: false,
        bar: 'two'
    };
    upsert(doc, SimpleTable, second);
    upsert(doc, SimpleTable, {
        key: '789',
        foo: true,
        bar: 'three'
    });

    // No-op update
    update(doc, SimpleTable, {
        key: '123'
    });
    expect(getKey(doc, SimpleTable, '123')).toEqual(first);

    // Update to first
    update(doc, SimpleTable, {
        key: '123',
        bar: 'updated!'
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
            another: 'foo'
        },
        notMapAtAll: {
            test: 'world'
        }
    });
    upsert(doc, ComplexTable, {
        key: '456',
        rawMap: new Y.Map(),
        convertedMap: {
            test: 'second',
            another: 'foo'
        },
        notMapAtAll: {
            test: 'world'
        }
    });

    update(doc, ComplexTable, {
        key: '123',
        convertedMap: {
            test: 'updated'
        }
    });
    expect(getKey(doc, ComplexTable, '123')?.convertedMap).toEqual({
        test: 'updated',
        another: 'foo'
    });
});

test('Key-level watching', () => {
    const doc = new Y.Doc();

    const addedRows: Row<typeof SimpleTable>[] = [];
    const removedRows: Row<typeof SimpleTable>[] = [];
    const changedRows: Row<typeof SimpleTable>[] = [];
    watch(doc, SimpleTable, eq('foo', true), 'keys', (added, removed, changed) => {
        addedRows.push(...added);
        removedRows.push(...removed);
        changedRows.push(...changed);
    });

    // Add stuff that will trigger watcher
    const first = {
        key: '123',
        foo: true,
        bar: 'one'
    };
    upsert(doc, SimpleTable, first);
    // And some that won't!
    const second = {
        key: '456',
        foo: false,
        bar: 'two'
    };
    upsert(doc, SimpleTable, second);
    const third = {
        key: '789',
        foo: true,
        bar: 'three'
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
    watch(doc, SimpleTable, eq('foo', true), 'content', (added, removed, changed) => {
        addedRows.push(...added);
        removedRows.push(...removed);
        changedRows.push(...changed);
    });

    // Add stuff that will trigger watcher
    const first = {
        key: '123',
        foo: true,
        bar: 'one'
    };
    upsert(doc, SimpleTable, first);
    // And some that won't!
    const second = {
        key: '456',
        foo: false,
        bar: 'two'
    };
    upsert(doc, SimpleTable, second);
    const third = {
        key: '789',
        foo: true,
        bar: 'three'
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
        bar: 'updated'
    });
    expect(addedRows).toHaveLength(2);
    expect(removedRows).toHaveLength(0);
    expect(changedRows).toEqual([{
        key: '123',
        foo: true,
        bar: 'updated'
    }]);

    // Make changes that shouldn't affect anything
    update(doc, SimpleTable, {
        key: '456',
        bar: 'updated2'
    });
    expect(addedRows).toHaveLength(2);
    expect(removedRows).toHaveLength(0);
    expect(changedRows).toHaveLength(1);

    // Make a change that causes third no longer to be watched
    // This should emit removal, NOT change!
    update(doc, SimpleTable, {
        key: '789',
        foo: false
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