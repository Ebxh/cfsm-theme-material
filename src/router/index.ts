import { createRouter, createWebHashHistory } from 'vue-router'

// CFSM 主題路由約定：首頁 `/#/`，詳情頁 `/#/server/:id`，管理入口 `/admin`
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue'),
    },
    {
      path: '/server/:id',
      name: 'instance-detail',
      component: () => import('@/views/InstanceDetail.vue'),
    },
  ],
})

router.beforeEach(() => {
  window.$loadingBar.start()
})

router.afterEach(() => {
  window.$loadingBar.finish()
})

export default router
