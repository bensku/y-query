import * as Y from 'yjs';

export interface Partition {
    id: string;
    get doc(): Y.Doc;
}

export interface DataSource {
    partitions(key?: string): Partition[];
}

export class SingleDocSource implements DataSource {
    #partitions: Partition[];

    constructor(doc: Y.Doc) {
        this.#partitions = [
            {
                id: 'single',
                doc
            }
        ]
    }

    partitions(key: string): Partition[] {
        return this.#partitions;
    }

}