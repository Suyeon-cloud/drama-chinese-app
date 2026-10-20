import { createEmitter, readJson, writeJson } from "./localJson";

/** localStorage 키 하나에 배열로 저장되는 컬렉션 */
export const createLocalCollection = <T>(
  key: string,
  getId: (item: T) => string,
  seed: () => T[] = () => [],
) => {
  const emitter = createEmitter(key);
  const all = (): T[] => readJson<T[] | null>(key, null) ?? seed();
  return {
    all,
    find: (id: string) => all().find((x) => getId(x) === id) ?? null,
    put(item: T) {
      const list = all();
      const i = list.findIndex((x) => getId(x) === getId(item));
      if (i >= 0) list[i] = item;
      else list.push(item);
      writeJson(key, list);
      emitter.emit();
    },
    remove(id: string) {
      writeJson(
        key,
        all().filter((x) => getId(x) !== id),
      );
      emitter.emit();
    },
    subscribe: emitter.subscribe,
  };
};
