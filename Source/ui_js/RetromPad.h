#pragma once

#include <atomic>
#include "input/PH_GenericInput.h"

class CRetromPad : public CPH_GenericInput
{
public:
	void Update(uint8*) override;
	static void Set(unsigned int, unsigned int, unsigned int);
	static void Enable(unsigned int, bool);
	static FactoryFunction Factory();

private:
	static std::atomic<unsigned int> m_values[2][PS2::CControllerInfo::MAX_BUTTONS];
	static std::atomic<bool> m_enabled[2];
};
