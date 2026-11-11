import 'monaco-editor/editor/editor.worker.js'
import { EDITOR_WORKER_READY } from './protocol'

self.postMessage({ type: EDITOR_WORKER_READY })
