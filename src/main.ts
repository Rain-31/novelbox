import './buffer-polyfill'
import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import './style.css'
import App from './App.vue'
import NovelEditor from './views/NovelEditor.vue'
import BookLibrary from './views/BookLibrary.vue'
import FragmentEditor from './views/FragmentEditor.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      component: BookLibrary
    },
    {
      path: '/editor',
      component: NovelEditor
    },
    {
      path: '/fragment-editor',
      component: FragmentEditor
    }
  ]
})

const app = createApp(App)
app.use(router)
app.use(ElementPlus)
app.mount('#app')
