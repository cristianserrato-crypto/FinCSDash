import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  // URL de tu backend Flask
  private apiUrl = 'http://127.0.0.1:5000';

  constructor(private http: HttpClient) { }

  // --- UTILIDADES ---
  private getHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    let headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  }

  // --- AUTENTICACIÓN ---
  login(credentials: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/login`, credentials);
  }

  register(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/register`, data);
  }

  verify(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/verify`, data);
  }

  // --- PERFIL ---
  checkInitialProfile(): Observable<any> {
    return this.http.get(`${this.apiUrl}/check-initial-profile`, { headers: this.getHeaders() });
  }

  // --- MOVIMIENTOS ---
  getMovements(month?: string, year?: string): Observable<any[]> {
    let url = `${this.apiUrl}/movements`;
    if (month && year) {
      url += `?month=${month}&year=${year}`;
    }
    return this.http.get<any[]>(url, { headers: this.getHeaders() });
  }

  // ... Aquí irás agregando el resto de métodos (addExpense, getBalance, etc.)
}