/**
 * Tests de los lenguajes nuevos: Go, Rust y Java.
 * Verifican que el parser genérico saca símbolos, imports y complejidad, y que
 * el resolver conecta los imports internos.
 */

import { describe, it, expect } from 'vitest';
import { analyzeProject } from '../src/analyze.js';
import type { SourceFile } from '../src/model.js';

const GO_MAIN = `package main

import (
	"fmt"
	"github.com/me/proj/greet"
)

// Server maneja pedidos.
type Server struct {
	name string
}

// Greet saluda.
func (s *Server) Greet(who string) string {
	if who == "" {
		who = "mundo"
	}
	return greet.Hello(who)
}

func main() {
	s := &Server{name: "x"}
	fmt.Println(s.Greet(""))
}
`;

const GO_GREET = `package greet

import "fmt"

func Hello(name string) string {
	return fmt.Sprintf("hola %s", name)
}
`;

const RUST_MAIN = `mod util;

use crate::util::shout;

pub struct App {
    count: u32,
}

impl App {
    pub fn run(&self) -> String {
        if self.count > 0 {
            shout("hi")
        } else {
            String::from("")
        }
    }
}

fn main() {
    let a = App { count: 1 };
    println!("{}", a.run());
}
`;

const RUST_UTIL = `pub fn shout(s: &str) -> String {
    s.to_uppercase()
}
`;

const RUST_IMPL = `pub struct App { count: u32 }
impl App {
    pub fn run(&self) -> u32 { self.count }
}
impl Clone for App {
    fn clone(&self) -> Self { App { count: self.count } }
}
`;

const JAVA_APP = `package com.example;

import com.example.util.Greeter;
import java.util.List;

public class App {
    private Greeter greeter;

    public String run(String name) {
        if (name == null) {
            return "?";
        }
        return greeter.greet(name);
    }
}
`;

const JAVA_GREETER = `package com.example.util;

public class Greeter {
    public String greet(String name) {
        return "hola " + name;
    }
}
`;

describe('Go', () => {
  it('saca símbolos, imports y resuelve el import interno vía go.mod', async () => {
    const files: SourceFile[] = [
      { path: 'main.go', content: GO_MAIN },
      { path: 'greet/greet.go', content: GO_GREET },
    ];
    const a = await analyzeProject(files, { projectName: 'go-demo', resolve: { goModule: 'github.com/me/proj' } });

    const main = a.files.find((f) => f.path === 'main.go')!;
    expect(main.language).toBe('go');
    expect(main.symbols.map((s) => s.name)).toEqual(
      expect.arrayContaining(['Server', 'Server.Greet', 'main']),
    );
    expect(main.metrics.complexity).toBeGreaterThan(1);

    const greetImport = main.imports.find((i) => i.specifier.includes('greet'))!;
    expect(greetImport.resolved).toBe('greet/greet.go');

    const edge = a.graph.edges.find(
      (e) => e.type === 'imports' && e.source === 'main.go' && e.target === 'greet/greet.go',
    );
    expect(edge).toBeDefined();
  });
});

describe('Rust', () => {
  it('saca símbolos y resuelve `mod` y `use crate::`', async () => {
    const files: SourceFile[] = [
      { path: 'src/main.rs', content: RUST_MAIN },
      { path: 'src/util.rs', content: RUST_UTIL },
    ];
    const a = await analyzeProject(files, { projectName: 'rust-demo' });

    const main = a.files.find((f) => f.path === 'src/main.rs')!;
    expect(main.language).toBe('rust');
    expect(main.symbols.map((s) => s.name)).toEqual(
      expect.arrayContaining(['App', 'App.run', 'main']),
    );

    const resolvedTargets = main.imports.map((i) => i.resolved).filter(Boolean);
    expect(resolvedTargets).toContain('src/util.rs');
  });

  it('un bloque `impl` no crea un tipo nuevo: sus métodos van al struct', async () => {
    const a = await analyzeProject([{ path: 'src/lib.rs', content: RUST_IMPL }], {
      projectName: 'rust-impl',
    });
    const names = a.files[0]!.symbols.map((s) => `${s.kind} ${s.name}`);
    expect(names).toEqual([
      'class App',
      'method App.run',
      'method App.clone', // ← del `impl Clone for App`, atribuido a App (no a "Clone")
    ]);
  });
});

describe('Go — paquete raíz', () => {
  it('resuelve un import al módulo raíz (archivos .go en la raíz)', async () => {
    const a = await analyzeProject(
      [
        { path: 'main.go', content: 'package app\nfunc Run() {}\n' },
        {
          path: 'worker.go',
          content: 'package app\n\nimport "github.com/x/app"\n\nfunc W() { app.Run() }\n',
        },
      ],
      { projectName: 'go-root', resolve: { goModule: 'github.com/x/app' } },
    );
    const imp = a.files.find((f) => f.path === 'worker.go')!.imports[0]!;
    expect(imp.resolved).toBe('main.go');
  });
});

describe('Java', () => {
  it('saca clases/métodos y resuelve el import por FQN', async () => {
    const files: SourceFile[] = [
      { path: 'src/main/java/com/example/App.java', content: JAVA_APP },
      { path: 'src/main/java/com/example/util/Greeter.java', content: JAVA_GREETER },
    ];
    const a = await analyzeProject(files, { projectName: 'java-demo' });

    const app = a.files.find((f) => f.path.endsWith('App.java'))!;
    expect(app.language).toBe('java');
    expect(app.symbols.map((s) => s.name)).toEqual(expect.arrayContaining(['App', 'App.run']));

    const greeterImport = app.imports.find((i) => i.specifier === 'com.example.util.Greeter')!;
    expect(greeterImport.resolved).toBe('src/main/java/com/example/util/Greeter.java');
    // El import del JDK queda externo.
    expect(app.imports.find((i) => i.specifier === 'java.util.List')!.kind).toBe('external');
  });
});
