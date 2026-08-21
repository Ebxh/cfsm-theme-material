/**
 * Material Web 按需注册
 *
 * 只导入项目实际使用的 md-* 自定义元素，避免 `@material/web/all.js` 全量打包。
 * 新增模板标签时，在此补对应入口即可。
 */

// Buttons
import '@material/web/button/filled-button.js'
import '@material/web/button/outlined-button.js'
import '@material/web/button/text-button.js'

// Progress
import '@material/web/progress/circular-progress.js'
import '@material/web/progress/linear-progress.js'

// Text field
import '@material/web/textfield/outlined-text-field.js'
