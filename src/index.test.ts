import { deepEquals, Dent, Dentata, syntheticCursor } from "./"

describe("blah", () => {
    it("basic", () => {
        // expect(sum(1, 1)).toEqual(2)
        const c = new Dent(5)
        const x = c.get()
        expect(x).toEqual(5)
        c.onChange(newVal => console.log(`x was changed to ${newVal}`))
        c.set(10)
        expect(c.get()).toEqual(10)
        c.apply(x => x + 1)
        expect(c.get()).toEqual(11)
    })
    it("nested objects", () => {
        // expect(sum(1, 1)).toEqual(2)
        const c = new Dent({ x: { y: { z: 1 } } })
        c.onChange((newVal, oldVal) =>
            console.log(
                `c  changed from to ${JSON.stringify(
                    oldVal,
                )}  to ${JSON.stringify(newVal)}`,
            ),
        )
        const zc = c.select("x").select("y").select("z")
        zc.onChange((newVal, oldVal) =>
            console.log(`z changed from ${oldVal} to ${newVal}`),
        )
        c.apply(o => ({ ...o }))
        zc.apply(n => n + 1)
        expect(zc.get()).toEqual(2)
        zc.apply(n => n + 1)
        expect(zc.get()).toEqual(3)
        // zc.set(undefined)
        // zc.set(10)
    })
    it("arrays", () => {
        const c = new Dent([{ a: 1 }, { a: 2 }, { a: 3 }] as
            | { a: number }[]
            | undefined)
        const c1a = (c as Dent<{ a: number }[]>).select(1).select("a")
        expect(c1a.get()).toEqual(2)
        c.set(undefined)
        expect(c1a.get()).toEqual(undefined)
    })
    it("changes in both directions", () => {
        const cur = new Dent({
            a: {
                b: { c: 1 },
            },
        })
        let aChanged = false
        let cChanged = false
        cur.select("a").onChange(() => {
            console.log("a changed in test4")
            aChanged = true
        })
        cur.select("a")
            .select("b")
            .select("c")
            .onChange(() => {
                console.log("c changed in test4")
                cChanged = true
            })
        cur.select("a").select("b").set({ c: 5 })
        expect(aChanged).toEqual(true)
        expect(cChanged).toEqual(true)
    })
    it("Dents pointing in loop don't cause crash", () => {
        const cur = new Dent({
            a: {
                b: { c: 1 },
            },
        })
        const a1 = cur.select("a")
        const a2 = cur.select("a")
        const b1 = a2.select("b")
        const b2 = a1.select("b")
        b1.set({ c: 2 })
        b2.set({ c: 3 })
    })
    it("doesnt give type errors when you apply deep", () => {
        const cur = new Dent({
            a: {
                b: { c: 1, g: 4 },
                d: { e: 2 },
            },
            f: 3,
        })
        cur.apply(o => ({
            ...o,
            a: { ...o.a, b: { ...o.a.b, c: 5 } },
        }))
        cur.apply(o => {
            // o.a.b.g = 5  // should give type error
            return o
        })
    })
    it("can hold callbacks", () => {
        const f = () => {}
        const d = new Dentata(f)
        expect(d.get()).toEqual(f)
        let count = 0
        d.onChange(() => count++)
        d.set(f)
        expect(count).toEqual(0)
        const f2 = () => {}
        d.set(f2)
        d.set(f2)
        expect(count).toEqual(1)
    })
    it("doesnt mutate input data", () => {
        const o = { a: 1 }
        const c = new Dentata(o)
        c.select("a").set(2)
        expect(o).toEqual({ a: 1 })
        const o2 = c.get()
        expect(o2).toEqual({ a: 2 })
        c.select("a").set(3)
        expect(o).toEqual({ a: 1 })
        expect(o2).toEqual({ a: 2 })
        expect(c.get()).toEqual({ a: 3 })
    })
    it("has working synthetic cursors", () => {
        const rect = new Dentata({ w: 5, h: 10 })
        const area = syntheticCursor(rect, ({ w, h }) => w * h)
        expect(area.get()).toEqual(50)
        let changed = false
        area.onChange(() => {
            changed = true
        })
        expect(changed).toEqual(false)
        rect.s("w").set(20)
        expect(changed).toEqual(true)
    })
    it("doesnt trigger listeners with unchanged data", () => {
        // Make a new data tree. The root cursor is just like any other cursor.
        const dentata = new Dentata({
            array: [5, 6, 7],
            nested: { objects: { are: "fine" } },
        })

        // Select some cursors inside the tree:
        const arrayCursor = dentata.select("array")
        // `s` is an alias for `select`
        const areCursor = dentata.s("nested").s("objects").s("are")

        let counter = 0
        // We'll just log changes to our cursors. More useful onChangers would update UI or trigger server actions or recalculate a value or whatever.
        arrayCursor.onChange(() => counter++)
        areCursor.onChange(() => counter++)
        dentata.onChange(() => counter++)
        dentata.set({ array: [5, 6, 7], nested: { objects: { are: "fine" } } })
        expect(counter).toEqual(0)
    })
    it("has good deepequals", () => {
        expect(deepEquals(5, 5)).toEqual(true)
        expect(deepEquals(0, -0)).toEqual(true)
        expect(deepEquals(0, 1)).toEqual(false)
        expect(deepEquals("foo", "bar")).toEqual(false)
        expect(deepEquals("foo", "foo")).toEqual(true)
        expect(deepEquals("", "")).toEqual(true)
        expect(deepEquals(null, {})).toEqual(false)
        expect(deepEquals(null, undefined)).toEqual(false)
        expect(deepEquals(null, false)).toEqual(false)
        expect(deepEquals(null, null)).toEqual(true)
        expect(deepEquals({}, {})).toEqual(true)
        expect(deepEquals([], [])).toEqual(true)
        const s1 = Symbol()
        const s2 = Symbol()
        expect(deepEquals(s1, s2)).toEqual(false)
        expect(deepEquals(s1, s1)).toEqual(true)
        const o1 = {
            [s1]: "foo",
            bar: { rosco: "baz", bum: "fum", nums: [1, 2, 3, 4] },
        }
        const o2 = {
            [s2]: "foo",
            bar: { rosco: "baz", bum: "fum", nums: [1, 2, 3, 4] },
        }
        const o3 = {
            [s1]: "foo",
            bar: { rosco: "baz", bum: "fum", nums: [1, 2, 3, 4] },
        }
        expect(deepEquals(o1, o1)).toEqual(true)
        expect(deepEquals(o1, o3)).toEqual(true)
        expect(deepEquals(o1, o2)).toEqual(false)
        expect(deepEquals(o3, o2)).toEqual(false)
        expect(deepEquals({ [s1]: "x" }, {})).toEqual(false)
        expect(
            deepEquals({ [s1]: "x", y: "z", a: "b" }, { y: "z", a: "b" }),
        ).toEqual(false)
        expect(deepEquals([1, 2, 3, 4], [1, 2, 3, 4, 5])).toEqual(false)
        expect(deepEquals([1, 2, 3, 4], [1, 2, 3, 4])).toEqual(true)
        expect(deepEquals(0, 0)).toEqual(true)
        const f = () => {}
        expect(deepEquals(f, f)).toEqual(true)
        expect(deepEquals(f, () => {})).toEqual(false)
    })
    it("doesnt make deepequals crash with recursive objects", () => {
        const o: Record<string, unknown> = { a: 1 }
        o["o"] = o
        expect(deepEquals(o, o)).toEqual(true)
    })
    it("is reasonably fast", () => {
        const start1 = performance.now()
        const r = () => Math.random()

        const smallTrees = 100_000
        const bigTreeSize = smallTrees
        const heavyTreeSize = smallTrees / 50
        const probChangeLevel = 100 / smallTrees
        // make a bunch of trees
        for (let i = 0; i < smallTrees; i++) {
            const d = new Dentata(r())
            d.get()
        }
        const smallTreesDuration = performance.now() - start1

        const start2 = performance.now()
        // make one big tree
        let c = new Dentata<any>({})
        let depth = 0
        let maxDepth = 0
        for (let i = 0; i < bigTreeSize; i++) {
            const key = r()
            c.setIn(key, {})
            if (r() < probChangeLevel) {
                if (r() < 0.5) {
                    // descend
                    c = c.select(key)
                    depth += 1
                    maxDepth = Math.max(maxDepth, depth)
                } else {
                    // ascend
                    // @ts-expect-error
                    c = c.parent ?? c
                    depth = Math.max(0, depth - 1)
                }
            }
        }
        const bigTreeDuration = performance.now() - start2

        const start3 = performance.now()
        let c2 = new Dentata<any>({})
        for (let i = 0; i < heavyTreeSize; i++) {
            c2.onChange(() => {})
            const key = r()
            c2.setIn(key, {})
            const temp = c2.select(key)
            temp.onChange(() => {})
            c2.get()
            temp.get()
            if (r() < probChangeLevel) {
                if (r() < 0.5) {
                    // descend
                    c2 = c2.select(key)
                    depth += 1
                    maxDepth = Math.max(maxDepth, depth)
                } else {
                    // ascend
                    // @ts-expect-error
                    c2 = c2.parent ?? c2
                    depth = Math.max(0, depth - 1)
                }
            }
        }
        const heavyTreeDuration = performance.now() - start3
        const totalDuration = performance.now() - start1
        console.log({
            smallTrees,
            smallTreesDuration,
            bigTreeSize,
            maxDepth,
            bigTreeDuration,
            heavyTreeSize,
            heavyTreeDuration,
        })
        expect(totalDuration).toBeLessThan(1000 * 30)
    })
})

/* function test() {
    const d = new Dentata({ a: "foo", b: { c: { d: "e" } } })
    const g1 = d.get()
    const g2 = d.get("a")
    const hmm = d.select("a").get("indexOf") // expected
    const g3 = d.get("b")
    const d2 = d.select("a")
    d.select("c") // expected
    const g4 = d2.get()
    const d3 = d.select("b").select("c").select("d")
}
 */
