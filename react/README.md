# React hooks for y-query
This library provides React hooks for watching y-query data.
Under the hood, this is a relatively simple wrapper on top of React's
[useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore)

## Installation
```sh
npm install @bensku/y-query-react
```

## Usage
Watch changes to queried data:
```tsx
const rows = useQuery(doc, YourTable, () => any(), [], 'content');

return <ul>
        {rows.map(row => <ul key={row.key}>{row.description}</ul>)}
    </ul>;
```

For more complex queries, be sure to pass dependencies of your query to `useQuery`.
It works exactly as it would with e.g. React's `useEffect`:
```ts
useQuery(doc, YourTable, () => eq('foo', bar), [bar], 'content');
```

Or watch a single row:
```ts
const row = useRow(doc, YourTable, YourRow, 'content');
```

A fully working example application is available at
[/examples/react-notepad](/examples/react-notepad).
