import axios from 'axios';
export const api=axios.create({baseURL:import.meta.env.VITE_API_URL||'/api',withCredentials:true});
let token:string|null=null; export const setToken=(v:string|null)=>{token=v};
api.interceptors.request.use(c=>{if(token)c.headers.Authorization=`Bearer ${token}`;return c});
api.interceptors.response.use(r=>r,async e=>{const c=e.config;if(e.response?.status===401&&!c._retry&&!c.url.includes('/auth/')){c._retry=true;try{const {data}=await api.post('/auth/refresh');setToken(data.accessToken);c.headers.Authorization=`Bearer ${data.accessToken}`;return api(c)}catch{setToken(null)}}return Promise.reject(e)});
