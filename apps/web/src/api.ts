import axios from 'axios';
export const api=axios.create({baseURL:'/api',withCredentials:true});
let token=localStorage.getItem('accessToken'); export const setToken=(v:string|null)=>{token=v;v?localStorage.setItem('accessToken',v):localStorage.removeItem('accessToken')};
api.interceptors.request.use(c=>{if(token)c.headers.Authorization=`Bearer ${token}`;return c});
api.interceptors.response.use(r=>r,async e=>{const c=e.config;if(e.response?.status===401&&!c._retry&&!c.url.includes('/auth/')){c._retry=true;try{const {data}=await api.post('/auth/refresh');setToken(data.accessToken);c.headers.Authorization=`Bearer ${data.accessToken}`;return api(c)}catch{setToken(null)}}return Promise.reject(e)});
