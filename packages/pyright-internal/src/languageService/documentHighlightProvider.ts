/*
 * documentHighlightProvider.ts
 * Copyright (c) Microsoft Corporation.
 * Licensed under the MIT license.
 * Author: Eric Traut
 *
 * Logic that maps a position within a Python program file into
 * one or more highlight types.
 */

import { CancellationToken, DocumentHighlight, DocumentHighlightKind } from 'vscode-languageserver';

import * as ParseTreeUtils from '../analyzer/parseTreeUtils';
import { throwIfCancellationRequested } from '../common/cancellationUtils';
import { ProgramView } from '../common/extensibility';
import { convertOffsetsToRange, convertPositionToOffset } from '../common/positionUtils';
import { Position, TextRange } from '../common/textRange';
import { ParseNodeType } from '../parser/parseNodes';
import { ParseResults } from '../parser/parser';
import { DocumentSymbolCollector } from './documentSymbolCollector';

export class DocumentHighlightProvider {
    private readonly _parseResults: ParseResults | undefined;

    constructor(
        private _program: ProgramView,
        private _filePath: string,
        private _position: Position,
        private _token: CancellationToken
    ) {
        this._parseResults = this._program.getParseResults(this._filePath);
    }

    getDocumentHighlight(): DocumentHighlight[] | undefined {
        throwIfCancellationRequested(this._token);
        if (!this._parseResults) {
            return undefined;
        }

        const offset = convertPositionToOffset(this._position, this._parseResults.tokenizerOutput.lines);
        if (offset === undefined) {
            return undefined;
        }

        const node = ParseTreeUtils.findNodeByOffset(this._parseResults.parseTree, offset);
        if (node === undefined) {
            return undefined;
        }

        if (node.nodeType !== ParseNodeType.Name) {
            return undefined;
        }

        const results = DocumentSymbolCollector.collectFromNode(
            node,
            this._program.evaluator!,
            this._token,
            this._parseResults.parseTree,
            /* treatModuleInImportAndFromImportSame */ true
        );

        const lines = this._parseResults.tokenizerOutput.lines;
        return results.map((r) => ({
            kind:
                r.node.nodeType === ParseNodeType.Name && ParseTreeUtils.isWriteAccess(r.node)
                    ? DocumentHighlightKind.Write
                    : DocumentHighlightKind.Read,
            range: convertOffsetsToRange(r.range.start, TextRange.getEnd(r.range), lines),
        }));
    }
}
