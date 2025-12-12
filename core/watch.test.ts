import { expect, test } from 'bun:test';
import z from 'zod';
import * as Y from 'yjs';
import { table } from './table';
import { any, getKey, watch, watchKey } from './view';
import { update, upsert } from './update';

// Test table with all field types relevant for watcher testing
const WatchTestTable = table(
    'watchtest',
    z.object({
        key: z.string(),
        simple: z.string(),
        nested: z.object({ value: z.string() }),
        rawMap: z.instanceof(Y.Map).meta({ syncAs: Y.Map }),
        rawXml: z.instanceof(Y.XmlFragment).meta({ syncAs: Y.XmlFragment }),
    }),
);

function createTestRow() {
    return {
        key: '1',
        simple: 'hello',
        nested: { value: 'world' },
        rawMap: new Y.Map(),
        rawXml: new Y.XmlFragment(),
    };
}

// =============================================================================
// 'keys' level tests
// =============================================================================

test("'keys' level triggers on row add", () => {
    const doc = new Y.Doc();
    let addCount = 0;

    watch(doc, WatchTestTable, any(), 'keys', (added) => {
        addCount += added.length;
    });

    upsert(doc, WatchTestTable, createTestRow());
    expect(addCount).toBe(1);
});

test("'keys' level triggers on row remove", () => {
    const doc = new Y.Doc();
    let removeCount = 0;

    upsert(doc, WatchTestTable, createTestRow());

    watch(doc, WatchTestTable, any(), 'keys', (_added, removed) => {
        removeCount += removed.length;
    });

    doc.getMap(WatchTestTable.name).delete('1');
    expect(removeCount).toBe(1);
});

test("'keys' level does NOT trigger on simple field changes", () => {
    const doc = new Y.Doc();
    upsert(doc, WatchTestTable, createTestRow());

    let changeCount = 0;
    watch(doc, WatchTestTable, any(), 'keys', (_added, _removed, changed) => {
        changeCount += changed.length;
    });

    update(doc, WatchTestTable, { key: '1', simple: 'updated' });
    expect(changeCount).toBe(0);
});

test("'keys' level does NOT trigger on nested object changes", () => {
    const doc = new Y.Doc();
    upsert(doc, WatchTestTable, createTestRow());

    let changeCount = 0;
    watch(doc, WatchTestTable, any(), 'keys', (_added, _removed, changed) => {
        changeCount += changed.length;
    });

    update(doc, WatchTestTable, { key: '1', nested: { value: 'updated' } });
    expect(changeCount).toBe(0);
});

// =============================================================================
// 'content' level tests
// =============================================================================

test("'content' level triggers on simple field changes", () => {
    const doc = new Y.Doc();
    upsert(doc, WatchTestTable, createTestRow());

    let changeCount = 0;
    watch(
        doc,
        WatchTestTable,
        any(),
        'content',
        (_added, _removed, changed) => {
            changeCount += changed.length;
        },
    );

    update(doc, WatchTestTable, { key: '1', simple: 'updated' });
    expect(changeCount).toBe(1);
});

test("'content' level triggers on nested z.object() changes", () => {
    const doc = new Y.Doc();
    upsert(doc, WatchTestTable, createTestRow());

    let changeCount = 0;
    watch(
        doc,
        WatchTestTable,
        any(),
        'content',
        (_added, _removed, changed) => {
            changeCount += changed.length;
        },
    );

    update(doc, WatchTestTable, { key: '1', nested: { value: 'updated' } });
    expect(changeCount).toBe(1);
});

test("'content' level does NOT trigger on raw Y.Map changes", () => {
    const doc = new Y.Doc();
    upsert(doc, WatchTestTable, createTestRow());

    let changeCount = 0;
    watch(
        doc,
        WatchTestTable,
        any(),
        'content',
        (_added, _removed, changed) => {
            changeCount += changed.length;
        },
    );

    // Modify the raw Y.Map directly
    const row = getKey(doc, WatchTestTable, '1');
    expect(row).not.toBeNull();
    row!.rawMap.set('foo', 'bar');

    expect(changeCount).toBe(0);
});

test("'content' level does NOT trigger on raw Y.XmlFragment changes", () => {
    const doc = new Y.Doc();
    upsert(doc, WatchTestTable, createTestRow());

    let changeCount = 0;
    watch(
        doc,
        WatchTestTable,
        any(),
        'content',
        (_added, _removed, changed) => {
            changeCount += changed.length;
        },
    );

    // Modify the raw Y.XmlFragment directly
    const row = getKey(doc, WatchTestTable, '1');
    expect(row).not.toBeNull();
    const textNode = new Y.XmlText('hello');
    row!.rawXml.insert(0, [textNode]);

    expect(changeCount).toBe(0);
});

// =============================================================================
// 'deep' level tests
// =============================================================================

test("'deep' level triggers on simple field changes", () => {
    const doc = new Y.Doc();
    upsert(doc, WatchTestTable, createTestRow());

    let changeCount = 0;
    watch(doc, WatchTestTable, any(), 'deep', (_added, _removed, changed) => {
        changeCount += changed.length;
    });

    update(doc, WatchTestTable, { key: '1', simple: 'updated' });
    expect(changeCount).toBe(1);
});

test("'deep' level triggers on nested z.object() changes", () => {
    const doc = new Y.Doc();
    upsert(doc, WatchTestTable, createTestRow());

    let changeCount = 0;
    watch(doc, WatchTestTable, any(), 'deep', (_added, _removed, changed) => {
        changeCount += changed.length;
    });

    update(doc, WatchTestTable, { key: '1', nested: { value: 'updated' } });
    expect(changeCount).toBe(1);
});

test("'deep' level triggers on raw Y.Map changes", () => {
    const doc = new Y.Doc();
    upsert(doc, WatchTestTable, createTestRow());

    let changeCount = 0;
    watch(doc, WatchTestTable, any(), 'deep', (_added, _removed, changed) => {
        changeCount += changed.length;
    });

    // Modify the raw Y.Map directly
    const row = getKey(doc, WatchTestTable, '1');
    expect(row).not.toBeNull();
    row!.rawMap.set('foo', 'bar');

    expect(changeCount).toBe(1);
});

test("'deep' level triggers on raw Y.XmlFragment changes", () => {
    const doc = new Y.Doc();
    upsert(doc, WatchTestTable, createTestRow());

    let changeCount = 0;
    watch(doc, WatchTestTable, any(), 'deep', (_added, _removed, changed) => {
        changeCount += changed.length;
    });

    // Modify the raw Y.XmlFragment directly
    const row = getKey(doc, WatchTestTable, '1');
    expect(row).not.toBeNull();
    const textNode = new Y.XmlText('hello');
    row!.rawXml.insert(0, [textNode]);

    expect(changeCount).toBe(1);
});

// watchKey() tests for completeness

test("watchKey 'content' level does NOT trigger on raw Y.Map changes", () => {
    const doc = new Y.Doc();
    upsert(doc, WatchTestTable, createTestRow());

    let callCount = 0;
    watchKey(doc, WatchTestTable, '1', 'content', () => {
        callCount++;
    });

    // Reset after initial call
    callCount = 0;

    // Modify the raw Y.Map directly
    const row = getKey(doc, WatchTestTable, '1');
    row!.rawMap.set('foo', 'bar');

    expect(callCount).toBe(0);
});

test("watchKey 'deep' level triggers on raw Y.Map changes", () => {
    const doc = new Y.Doc();
    upsert(doc, WatchTestTable, createTestRow());

    let callCount = 0;
    watchKey(doc, WatchTestTable, '1', 'deep', () => {
        callCount++;
    });

    // Reset after initial call
    callCount = 0;

    // Modify the raw Y.Map directly
    const row = getKey(doc, WatchTestTable, '1');
    row!.rawMap.set('foo', 'bar');

    expect(callCount).toBe(1);
});
