import * as Y from 'yjs';
import z from 'zod';
import {
    any,
    eq,
    getKey,
    remove,
    select,
    table,
    update,
    upsert,
    watch,
} from '../index';

// Configure a table
const MyTable = table(
    'mytable',
    z.object({
        key: z.string(),
        hello: z.string(),
        isHelloWorld: z.boolean(),
    }),
);

// Setup our database (not persisted anywhere in this example)
const doc = new Y.Doc();

// Add some rows
upsert(doc, MyTable, {
    key: 'first',
    hello: 'world',
    isHelloWorld: true,
});
upsert(doc, MyTable, {
    key: 'second',
    hello: 'test',
    isHelloWorld: false,
});

// Query them
console.log('Everything:', select(doc, MyTable, any()));
console.log('Hello worlds:', select(doc, MyTable, eq('isHelloWorld', true)));

// ... or fetch by keys
console.log('First:', getKey(doc, MyTable, 'first'));

// Modify the data
update(doc, MyTable, {
    key: 'second',
    isHelloWorld: true, // It isn't but whatever
});

// And our query results changed
console.log(
    'Hello worlds, again:',
    select(doc, MyTable, eq('isHelloWorld', true)),
);

// Let's try some of the realtime features!
// Watch over rows that match our criteria
watch(
    doc,
    MyTable,
    eq('isHelloWorld', true),
    'content',
    (added, removed, changed) => {
        console.log(added, removed, changed);
    },
);
// Note how we immediately got the current table content, as if we had select()ed it?

// Add a new row - watcher will be notified
upsert(doc, MyTable, {
    key: 'third',
    hello: 'totally world',
    isHelloWorld: true,
});

// Remove a row - notified again
remove(doc, MyTable, 'first');

// Update - notified
update(doc, MyTable, {
    key: 'third',
    hello: 'updated world',
});

// Update so taht query does not match
// From watcher's perspective, this is same as removal!
update(doc, MyTable, {
    key: 'second',
    isHelloWorld: false,
});

// Make another table that uses raw Yjs shared types!
const AnotherTable = table(
    'another',
    z.object({
        key: z.string(),
        hello: z.string(),
        rawMap: z.instanceof(Y.Map).meta({ syncAs: Y.Map }),
        rawXml: z.instanceof(Y.XmlFragment).meta({ syncAs: Y.XmlFragment }),
    }),
);
upsert(doc, AnotherTable, {
    key: 'first',
    hello: 'world',
    rawMap: new Y.Map(),
    rawXml: new Y.XmlFragment(),
});
// ... and get the shared types that will automatically sync
const first = getKey(doc, AnotherTable, 'first');
first?.rawMap.set('foo', 'bar');
console.log(getKey(doc, AnotherTable, 'first')?.rawMap.get('foo'));
