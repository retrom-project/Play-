#include <chrono>
#include <emscripten/bind.h>
#include "Ps2VmJs.h"
#include "RetromPad.h"
#include "AppConfig.h"
#include "PS2VM_Preferences.h"

extern CPs2VmJs* g_virtualMachine;
static std::future<bool> g_retromOperation;

static int Poll()
{
	if(!g_retromOperation.valid()) return -1;
	if(g_retromOperation.wait_for(std::chrono::seconds(0)) != std::future_status::ready) return 0;
	try { return g_retromOperation.get() ? 1 : -1; }
	catch(...) { return -1; }
}

static void Request(int operation, std::string path)
{
	if(g_retromOperation.valid()) throw std::runtime_error("PLAY_OPERATION_BUSY");
	switch(operation)
	{
	case 0: g_retromOperation = g_virtualMachine->RetromBoot(path); break;
	case 1:
		g_virtualMachine->PauseAsync();
		g_retromOperation = g_virtualMachine->RetromBarrier(false);
		break;
	case 2: g_retromOperation = g_virtualMachine->RetromBarrier(true); break;
	case 3: g_retromOperation = g_virtualMachine->SaveState("/retrom/state.zip"); break;
	case 4: g_retromOperation = g_virtualMachine->LoadState("/retrom/state.zip"); break;
	default: throw std::runtime_error("PLAY_OPERATION_INVALID");
	}
}

static void Configure()
{
	CAppConfig::GetInstance().SetPreferencePath(PREF_PS2_MC0_DIRECTORY, "/retrom/mc0");
	CAppConfig::GetInstance().SetPreferencePath(PREF_PS2_MC1_DIRECTORY, "/retrom/mc1");
}

EMSCRIPTEN_BINDINGS(Retrom)
{
	emscripten::function("retromRequest", &Request);
	emscripten::function("retromPoll", &Poll);
	emscripten::function("retromConfigure", &Configure);
	emscripten::function("retromPad", &CRetromPad::Set);
	emscripten::function("retromPadEnabled", &CRetromPad::Enable);
}
