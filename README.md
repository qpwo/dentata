# dentata

Simple, lean, and fully-typed data tree with change listeners for node and the browser, javscript or typescript. A state manager that keeps things simple, fast, and understandable. A minimalist/bare-bones alternative to baobab. (Not to mention redux, etc.)

You make a tree/cursor with `new Dentata(data)` and just have `get`, `set`, `apply(update: old => new)`, and `onChange(handler)`. This is flexible enough to manage state server-side, with simple DOM-based apps, in react, or in libraries. A change event will only fire if the new data is actually different, and will always fire if anything at or below the cursor is different.

Thanks to a cached deep equality check, all of this is very fast. The diff is only taken on nodes that have children or listeners, so it is often avoided.

If your editor supports typescript well (e.g. vscode) then you also get auto-complete for keys and compile-time errors for invalid keys or values.

```
npm install dentata
yarn add dentata
```

## Auto-complete and compile-time errors

TODO: insert pictures here

## Complete basic example

```js
import { Dentata } from 'dentata';

const dentata = new Dentata({array: [5,6,7], nested: {objects: {are: 'fine'}}})

const arrayCursor = dentata.select('array')
// `s` is an alias for `select`
const areCursor = dentata.s('nested').s('objects').s('are')

arrayCursor.onChange((next, last) => console.log('array changed from', last,  'to',  next))
areCursor.onChange((next, last) => console.log('are changed from', last,  'to',  next))
dentata.onChange((next, last) => console.log('entire tree changed from', last,  'to',  next))

arrayCursor.apply(last => [...last, 8])
// log: array changed from [ 5, 6, 7 ] to [ 5, 6, 7, 8 ]
// log: entire tree changed from { array: [ 5, 6, 7 ], nested: { objects: { are: 'fine' } } } to { array: [ 5, 6, 7, 8 ], nested: { objects: { are: 'fine' } } }

arrayCursor.select(0).set(555)
// log: array changed from [ 5, 6, 7, 8 ] to [ 555, 6, 7, 8 ]
// log: entire tree changed from { array: [ 5, 6, 7, 8 ], nested: { objects: { are: 'fine' } } } to { array: [ 555, 6, 7, 8 ], nested: { objects: { are: 'fine' } } }

areCursor.set('okay')
// log: are changed from fine to okay
// log: entire tree changed from { array: [ 555, 6, 7, 8 ], nested: { objects: { are: 'fine' } } } to { array: [ 555, 6, 7, 8 ], nested: { objects: { are: 'okay' } } }

dentata.apply(d => ({...d, newKey: 'newVal'}))
// log: entire tree changed from { array: [ 555, 6, 7, 8 ], nested: { objects: { are: 'okay' } } } to { array: [ 555, 6, 7, 8 ], nested: { objects: { are: 'okay' } }, newKey: 'newVal' }

// setting a value to undefined releases all cursors and listeners:
dentata.set(undefined)
// (all three listeners fire)
dentata.set(null)
// (no listeners fire)
```

## React Example

```jsx
function useDentata(cursor) {
    const [val, setVal] = useState(cursor.get())
    cursor.onChange(next => setVal(next))
    return val
}

function User() {
    const username = useDentata(tree.select('username'))
    return <h1>You are {username}.</h1>
}

function AnotherButtonSomewhereElse() {
    const cursor = tree.select('username')
    return <button onClick={() => cursor.set('new username')}>Click</button>
}
```

## Compose cursors

```ts
// Use the helper:
import { syntheticCursor } from 'dentata'

const sumCursor = syntheticCursor(tree.select('numbers'), nums => nums.reduce((x, y) => x + y, 0))
const currentSum = sumCursor.get()
sumCursor.onChange(newSum => myDiv.innerText = `sum: ${newSum}`)
// synthetic cursors do not have `set` or `select`, naturally.

// Or you can roll your own:
function makeAreaCursor(rectangleCursor) {
    const listeners = []
    const areaOf = { width, height } => width * height
    return {
        get: () => areaOf(rectangleCursor)
        set: (newArea) => {
            const side = Math.sqrt(newArea)
            rectangleCursor.set({width: side, height: side})
        }
    }
}

const area = makeAreaCursor(rectangleCursor)
console.log(area.get())
```
