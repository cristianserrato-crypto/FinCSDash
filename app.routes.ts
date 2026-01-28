import { Routes } from '@angular/router';
import { LoginComponent } from './login.component';

export const routes: Routes = [
  // Ruta por defecto: Redirigir a /login
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  
  // Ruta del Login
  { path: 'login', component: LoginComponent },
  
  // Aquí podrás agregar más rutas después, por ejemplo:
  // { path: 'dashboard', component: DashboardComponent },
  // { path: 'register', component: RegisterComponent },
];