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

// 添加路由变化监听，设置HTML的data-route属性
router.beforeEach((to, _from, next) => {
  // 从路径中提取路由名称
  const routeName = to.path.substring(1) || 'home';
  // 设置HTML的data-route属性
  document.documentElement.setAttribute('data-route', routeName);
  next();
});

const app = createApp(App)
app.use(router)
app.use(ElementPlus)
app.mount('#app')
