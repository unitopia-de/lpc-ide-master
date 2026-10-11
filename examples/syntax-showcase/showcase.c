// ============================================================================
// LPC-IDE-Master — Syntax-Showcase
//
// Diese Datei demonstriert alle Syntax-Elemente, die das Plugin highlighten
// kann. Sie ist NICHT auf Kompilierbarkeit ausgelegt — Zweck ist rein
// visuelle Inspektion (passe ein Theme an, prüfe Token-Scopes mit
// Strg+Shift+P -> "Inspect Editor Tokens and Scopes").
// ============================================================================


// --- 1. Kommentare ---------------------------------------------------------

// Einzeiliger Kommentar mit Code-Tags: TODO FIXME XXX HACK NOTE

/* Block-Kommentar
 * TODO: noch was tun
 * FIXME: hier ist ein Fehler
 */

/**
 * Doc-artiger Kommentar — wird wie ein normaler Block-Kommentar gefärbt.
 * FUNKTION: showcase
 * DEKLARATION: void showcase()
 */


// --- 2. Preprocessor -------------------------------------------------------

#include "/sys/lpctypes.h"
#include "/std/room.h"
#include <stdarg.h>

#define MAX_PLAYERS 100
#define GREET(name) ("Hallo " + name + "!")
#define MULTILINE_MACRO(x, y) \
    do { \
        write(x); \
        write(y); \
    } while (0)

#undef OLD_FLAG

#if __VERSION__ > "3.6.0"
#  pragma strong_types
#  pragma save_types
#elif defined(LEGACY)
#  warn "Legacy mode aktiv"
#else
#  error "Nicht unterstützte Version"
#endif

#ifdef __LDMUD__
#  pragma no_inherit
#endif

#ifndef DEBUG
#  define DEBUG 0
#endif


// --- 3. Konstanten (LDMud-Pseudo-Macros) ----------------------------------

string version_info = __VERSION__;
string file_info    = __FILE__;
int    line_info    = __LINE__;
string dir_info     = __DIR__;
int    is_ldmud     = __LDMUD__;
int    max_eval     = __MAX_EVAL_COST__;


// --- 4. Typen + Modifier (Variablen-Deklarationen) -------------------------

private   static  int     counter        = 0;
protected         string  prefix         = "[showcase]";
public            mapping cache          = ([ ]);
nomask            object  *all_rooms     = ({ });
varargs           closure callback;
nosave            mixed   tmp_data;
deprecated        status  old_flag       = 1;
                  bytes   binary_buffer;
                  symbol  sym            = 'foo;
                  coroutine task;
                  lpctype runtime_type;
                  lwobject light_obj;
                  funcall handler;
                  unknown legacy_value;
                  float   pi             = 3.14159;
                  struct  Player         current_player;


// --- 5. Strukturen ---------------------------------------------------------

struct Player {
    string name;
    int    level;
    object env;
    mixed  *inventory;
};

struct Coord {
    int x;
    int y;
    int z;
};


// --- 6. Zahlen -------------------------------------------------------------

int dec_a   = 42;
int dec_b   = 100L;
int dec_c   = 0u;
int hex_a   = 0xFF;
int hex_b   = 0xDEADBEEFu;
int bin_a   = 0b1010;
int bin_b   = 0b11111111ul;
int oct_a   = 0777;
int oct_b   = 0123;

float f_a   = 3.14;
float f_b   = .5;
float f_c   = 1.5e10;
float f_d   = 2.0E-3;
float f_e   = 1.0f;


// --- 7. Zeichen + Symbole --------------------------------------------------

int    ch_a    = 'a';
int    ch_b    = '\n';
int    ch_c    = '\t';
int    ch_d    = '\x41';
int    ch_e    = '\\';
int    ch_f    = '\'';
symbol sym_a   = 'foo;
symbol sym_b   = 'bar;


// --- 8. Strings ------------------------------------------------------------

string plain       = "Ein simpler String";
string escaped     = "Zeile1\nZeile2\tEnde";
string unicode     = "Umlaut: ä ö ü, Code: \x41\x42\x43";
string with_format = sprintf("%s hat %d Goldstücke (%-20s)", name, gold, title);
string padded      = sprintf("%'*'20d", value);

// Heredoc (Text)
string poem = @POEM
Es war einmal in einem MUD,
da kam ein neuer Magier hervor,
der sich am %s erfreute
und allerlei Gegenstände beschwor.
POEM

// Array-Heredoc
string *menu = @@MENU
Schwert
Schild
Trank
Bogen
MENU


// --- 9. Closures, Symbols, Closure-Referenzen ------------------------------

closure double_it      = #'+;            // Operator-Closure
closure get_environment = #'environment;  // Efun-Closure
closure custom = lambda(({'x}), ({#'*, 'x, 2}));
closure inline = (: $1 * 2 :);
closure with_capture = (: write($1 + " " + this_object()->query_name()) :);


// --- 10. Arrays, Mappings, Multisets, Closures ----------------------------

mixed *array_a   = ({ 1, 2, 3, "vier", 5.0 });
mixed *array_b   = ({ ({ 1, 2 }), ({ 3, 4 }) });
mapping map_a    = ([ "a": 1, "b": 2, "c": 3 ]);
mapping map_b    = ([ "key": ({ 1, 2 }); "with-width": ([ "nested": 0 ]) ]);
mapping multiset = (< "tag1", "tag2", "tag3" >);
closure plus_one = (: 1 + $1 :);


// --- 11. Kontrollstrukturen -----------------------------------------------

void control_flow_demo() {
    int i, sum = 0;
    string msg;

    // if/else
    if (i > 0) {
        sum += i;
    } else if (i == 0) {
        sum = 0;
    } else {
        sum -= i;
    }

    // for
    for (i = 0; i < 10; i++) {
        sum += i;
        if (sum > 100) break;
        if (i == 5) continue;
    }

    // while + do/while
    while (sum > 0) {
        sum--;
    }
    do {
        sum++;
    } while (sum < 10);

    // foreach
    foreach (string key, int val : map_a) {
        write(key + ": " + val + "\n");
    }
    foreach (mixed item : array_a) {
        write(to_string(item) + " ");
    }

    // switch/case/default
    switch (i) {
        case 1:
            msg = "eins";
            break;
        case 2:
        case 3:
            msg = "zwei oder drei";
            break;
        default:
            msg = "irgendwas";
    }

    // return
    return;
}


// --- 12. Inherit & Lifecycle-Funktionen (Applies) -------------------------

inherit "/std/room";
inherit "/std/container";
virtual inherit "/std/item";

void create() {
    ::create();
    SetProp(P_INT_SHORT, "Demo-Raum");
    SetProp(P_LIGHT, 1);
}

void init() {
    ::init();
    add_action("look", "schau");
}

void reset() {
    ::reset();
    set_next_reset(900);
}

void heart_beat() {
    counter++;
}

mixed catch_tell(string msg) {
    return msg;
}

mixed catch_msg(string msg, object source) {
    return msg;
}

void clean_up() {
    destruct(this_object());
}

string id(string name) {
    return name == "demo";
}


// --- 13. Funktions-Deklarationen mit verschiedenen Modifikatoren ----------

varargs int add_numbers(int a, int b, int c) {
    return a + b + (c ?? 0);
}

protected void log_event(string event, mixed... args) {
    if (DEBUG) write(sprintf("[%s] %s %O\n", ctime(time()), event, args));
}

private static mixed compute(closure fn, mixed *args) {
    return apply(fn, args);
}

public nomask string get_version() {
    return __VERSION__;
}

deprecated string old_function() {
    return "veraltet";
}


// --- 14. Efun-Aufrufe (Hover/Completion/Signature-Help testen) ------------

void efun_demo() {
    object pl    = find_player("magier");
    object env   = environment(pl);
    object *inv  = all_inventory(env);
    int    n     = sizeof(inv);
    string s     = sprintf("%d Objekte im Raum", n);
    write(s + "\n");

    mapping props = ([ ]);
    m_add(props, "key1", "value1");
    m_add(props, "key2", 42);

    int now = time();
    string ts  = ctime(now);
    string utc = strftime("%Y-%m-%d %H:%M:%S", now);

    object clone = clone_object("/std/torch");
    move_object(clone, env);

    int *bits = ({ 1, 0, 1, 1, 0 });
    string hashed = md5(s);

    call_out("delayed_task", 60, pl, "argument");
}


// --- 15. Sfun-Aufrufe (UNItopia) -----------------------------------------

void sfun_demo(object pl) {
    if (!playerp(pl)) {
        notify_fail("Kein Spieler.\n");
        return;
    }
    int gold = QueryProp(P_MONEY);
    SetProp(P_MONEY, gold + 10);
    string sex_word = choose_by_gender(pl, ({ "er", "sie", "es" }));
    write(sex_word + " hat jetzt " + (gold + 10) + " Goldstücke.\n");
}


// --- 16. Operatoren -------------------------------------------------------

void operator_demo() {
    int a = 5, b = 3, c;
    int x;

    // Arithmetik
    c = a + b;
    c = a - b;
    c = a * b;
    c = a / b;
    c = a % b;
    c = a++;
    c = ++b;

    // Zuweisung
    x = 0;
    x += 1;
    x -= 1;
    x *= 2;
    x /= 2;
    x %= 3;
    x |= 0xFF;
    x &= 0x0F;
    x ^= 0xAA;
    x <<= 2;
    x >>= 1;

    // Vergleich
    if (a == b) ;
    if (a != b) ;
    if (a <  b) ;
    if (a >  b) ;
    if (a <= b) ;
    if (a >= b) ;

    // Logik
    if (a && b)        ;
    if (a || b)        ;
    if (!a)            ;

    // Bitweise
    c = a & b;
    c = a | b;
    c = a ^ b;
    c = ~a;
    c = a << 2;
    c = a >> 1;

    // Member-/Scope-Zugriffe
    object pl = this_player();
    string name = pl->query_name();
    int    lvl  = (int)pl->query_level();
    string ver  = efun::__VERSION__;
    ::create();

    // Ternär
    string greet = (a > b) ? "größer" : "kleiner-gleich";
}


// --- 17. catch / throw ----------------------------------------------------

void error_demo() {
    string err = catch (
        risky_call();
        validate_input();
    );
    if (err) {
        write("Fehler: " + err + "\n");
        throw("Eigener Fehler");
    }

    // try-style auch über catch():
    mixed result = catch( result = compute(some_closure, ({ 1, 2, 3 })) );
}


// --- 18. Coroutinen (LDMud 3.6+) ------------------------------------------

coroutine my_coroutine() {
    int i;
    for (i = 0; i < 3; i++) {
        write("Schritt " + i + "\n");
        yield i;
    }
    return "fertig";
}

void run_coroutine() {
    coroutine cr = my_coroutine();
    mixed value;
    while (1) {
        value = call_coroutine(cr);
        if (!value) break;
    }
}


// --- 19. sprintf-Formate (Heuristik testen) -------------------------------

void format_demo(string name, int gold, object *items) {
    write(sprintf("%s\n", name));
    write(sprintf("%-30s %d\n", name, gold));
    write(sprintf("%+5d\n", gold));
    write(sprintf("%#x\n", 0xff));
    write(sprintf("%.2f\n", 3.14159));
    write(sprintf("%O\n", items));
    write(sprintf("%%-Zeichen wörtlich\n"));
    write(sprintf("%'='30s\n", "Titel"));
    write(sprintf("%|20s\n", "zentriert"));
}


// --- 20. Whitespace + Fehlertests am Rand des Highlights ------------------

// (TextMate-Grammars verzeihen vieles; hier ein paar typische Stolperstellen.)

string mix = "Tab im String:\tEnde";
int wide  = 1 << 24;
string raw = "Pfad: C:\\temp\\datei.txt";

// Ende der Showcase-Datei
