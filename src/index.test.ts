import { Dent, Dentata } from "./"

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
    it("doesnt mutate input data", () => {
        const o = { a: 1 }
        const c = new Dentata(o)
        c.select("a").set(2)
        expect(o).toEqual({ a: 1 })
        expect(c.get()).toEqual({ a: 2 })
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
