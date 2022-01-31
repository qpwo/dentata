# dentata

Simple, lean, and fully-typed data tree with change listeners for node and the browser, javscript or typescript.

A minimalist/bare-bones alternative to baobab. (Not to mention redux, etc.)

Critically, dentata requires you to select on arrays by value, instead of by index, a massive source of bugs in giant-tree-based (i.e. most model-view-controller) codebases.

Developed with yarn version v1.22.17

Simple browser typescript example:

```ts
import Dentata from "dentata"

interface MyTree {
    score: number
    theme: "dark" | "light"
    characters: {
        enemies: Record<ID, Character>
        allies: Record<ID, Character>
    }
    things: { some: "properties"; are: "here"; id: ID }[]
    nested?: { data: { is: "fine" } }
}

type ID = number
interface Character {
    name: string
    health: number
}

const tree = new Dentata({
    score: 0,
    theme: "dark",
    characters: {
        enemies: {
            123: { name: "wolf", health: 10 },
            456: { name: "wolf", health: 12 },
            789: { name: "fox", health: 4 },
        },
        allies: {
            321: { name: "knight", health: 50 },
        },
    },
} as MyTree)

const scoreDiv = document.getElementById("scoreBox")
const healthDiv = document.getElementById("health")

tree.s("score").onChange(newScore => (scoreDiv.innerText = newScore))
```
