import { expect, test } from "bun:test";
import z from "zod";
import * as Y from 'yjs';
import { table } from "./table";
import { any, eq, getKey, or, select } from "./view";
import { update, upsert } from "./update";

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
            test: 'hello'
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
    expect(select(doc, SimpleTable, any())).toBeEmpty();

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