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
const filter = useMemo(() => any<YourRow>(), []);
const rows = useQuery(doc, YourTable, filter, 'content');

return <ul>
        {rows.map(row => <ul key={row.key}>{row.description}</ul>)}
    </ul>;
```

Or watch a single row:
```ts
const row = useRow(doc, YourTable, YourRow, 'content');
```

A fully working example application is available at
[/examples/react-notepad](/examples/react-notepad).
