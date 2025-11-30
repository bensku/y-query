# y-query
Have you ever wanted to use [Yjs](https://yjs.dev/) CRDTs as a collaborative
database? You've come to right place!

y-query provides:
* Strongly typed, [Zod](https://zod.dev/)-based data layer on top of Yjs
  * Full typescript support!
* Queryable tables!
* Watcher system for observing changes real-time

## Limitations
> **-query is alpha-quality software!** In addition to below limitations, it
> is probably buggy. Some of those bugs might decide to eat your data!
Before we proceed, you should understand y-query's fundamental limitations.
These are not *bugs*, and as such, it is unlikely they'll ever be "fixed".

First of all, Yjs and by extension, this library, are
[strongly eventually consistent](https://lewiscampbell.tech/blog/250908.html).
In other words, **y-query is not an ACID-compliant database**; if you treat it
as one, expect your data to be eaten. If the topic is not familiar to you,
you should really read the above link and
[related discussion](https://news.ycombinator.com/item?id=45177518)
before using y-query!

**y-query is not a relational database!** This is not to say you can't use
it to store relational data, but you'll get to write your own joins. In simple
cases this might even make sense, if you really need the collaboration
aspect. For schemas with complex relationships, though... You've been warned!

When it comes to performance, do keep in mind that y-query is essentially an
*in-memory database* that gets replicated on your users' devices. You probably
shouldn't store more than, say, 10k rows in a single database.
Scaling beyond this can be achieved by sharding over multiple Y.Docs and
taking care to only sync the documents that are required. Depending on  your
application, this may be entirely trivial or close to impossible.

Finally, Yjs has zero support for limiting read access within a single
`Y.Doc`. Sharding over multiple documents can help, but it is another thing
you would need to implement yourself.

## Quick start
Install y-query with your favorite package manager. For example:
```sh
npm install @bensku/y-query
```

Create your first table:
```ts
const SimpleTable = table('mytable', z.object({
    key: z.string(),
    hello: z.string(),
}));
```

Create a non-persistent `Y.Doc` to serve as database and add some data to our
table within it:
```ts
const doc = new Y.Doc();

upsert(doc, MyTable, {
    key: 'first',
    hello: 'world',
    isHelloWorld: true
});
upsert(doc, MyTable, {
    key: 'second',
    hello: 'test',
    isHelloWorld: false
});
```

Query that data!
```ts
console.log('Everything:', select(doc, MyTable, any()));
console.log('Hello worlds:', select(doc, MyTable, eq('isHelloWorld', true)));
```

Or if you want something by its key, ask for it directly:
```ts
console.log('First:', getKey(doc, MyTable, 'first'));
```

Maybe we want the second row to be a hello world too?
```ts
update(doc, MyTable, {
    key: 'second',
    isHelloWorld: true // It isn't but whatever
});
console.log('Hello worlds, again:', select(doc, MyTable, eq('isHelloWorld', true)));
```

Every database in the world can do these things. But watch *this*:
```ts
watch(doc, MyTable, eq('isHelloWorld', true), 'content', (added, removed, changed) => {
    console.log(added, removed, changed);
});
```
The watcher callback immediately got the current rows that match the query.
And if we add a row...
```ts
upsert(doc, MyTable, {
    key: 'third',
    hello: 'totally world',
    isHelloWorld: true
});
```
The watcher will be called! Same happens on removal:
```ts
remove(doc, MyTable, 'first');
```

And, as you might expect, when one of the existing rows gets modified:
```ts
update(doc, MyTable, {
    key: 'third',
    hello: 'updated world',
});
```

But what if an update changes the row's content in a way that makes our query
no longer find it?
```ts
update(doc, MyTable, {
    key: 'second',
    isHelloWorld: false
});
```
From watcher's perspective, the row will be removed, not updated!
> For performance reasons, this will not currently occur the other way around.
> In future, a flag to do this (at cost of performance) will be added

Allright, we've covered realtime aspects of y-query. But there is one more
thing. If your application needs raw Yjs
[shared types](https://docs.yjs.dev/getting-started/working-with-shared-types)
to, say, sync content of your rich text editor...
```ts
const AnotherTable = table('another', z.object({
    key: z.string(),
    hello: z.string(),
    rawMap: z.instanceof(Y.Map).meta({ syncAs: Y.Map }),
    rawXml: z.instanceof(Y.XmlFragment).meta({ syncAs: Y.XmlFragment })
}));
```
You can just do it, even inside a table that also has y-query structured data!

Full source code of this quick start is available
at [examples/hello.ts](examples/hello.ts).

## Usage
See JSDoc and the above quick start. Better documentation will be
provided later...

## Future work
* React hooks
* Hard(er) row deletions
* Better documentation