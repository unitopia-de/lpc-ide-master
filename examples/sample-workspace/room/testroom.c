// Beispielraum für die UNIlib.
inherit "/std/room";

void create() {
    ::create();
    SetProp(P_INT_SHORT, "Ein leerer Testraum");
    SetProp(P_INT_LONG,
        "Ein vollständig leerer Raum, der nur zu Demonstrationszwecken existiert.\n");
    SetProp(P_LIGHT, 1);
}

void init() {
    ::init();
    add_action("look", "schau");
}

int look(string str) {
    write("Du schaust dich um.\n");
    return 1;
}
